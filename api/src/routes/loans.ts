import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateInstallments } from "../loans/amortization";
import { getPlaidItem } from "../plaid/items";
import { behaviorScore, finalScore, THRESHOLD, type BehaviorHistory } from "../plaid/scoring";
import type { Bindings, Variables } from "../types";

const FLAT_INTEREST_RATE = 0.05;

const loans = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function loadBehaviorHistory(
  db: D1Database,
  userId: string
): Promise<BehaviorHistory> {
  const profile = await db
    .prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ kyc_status: "pending" | "approved" | "rejected" }>();

  const counts = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'fully_paid' THEN 1 ELSE 0 END), 0) AS fully_paid,
         COALESCE(SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END), 0) AS defaulted
       FROM loans WHERE borrower_id = ?`
    )
    .bind(userId)
    .first<{ fully_paid: number; defaulted: number }>();

  const overdue = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM installments i
         JOIN loans l ON l.id = i.loan_id
       WHERE l.borrower_id = ? AND i.status = 'overdue'`
    )
    .bind(userId)
    .first<{ n: number }>();

  return {
    kycStatus: profile?.kyc_status ?? "pending",
    fullyPaidCount: counts?.fully_paid ?? 0,
    defaultedCount: counts?.defaulted ?? 0,
    overdueInstallmentCount: overdue?.n ?? 0,
  };
}

loans.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; termMonths: number }>();

  if (body.amount <= 0 || body.termMonths <= 0) {
    return c.json({ error: "amount and termMonths must be positive" }, 400);
  }

  const userId = c.var.userId;

  const bank = await getPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  if (!bank) {
    return c.json({ error: "Bank audit required; connect a bank via /api/plaid/connect first" }, 428);
  }

  const history = await loadBehaviorHistory(c.env.DB, userId);
  const behavior = behaviorScore(history);
  const score = finalScore(bank.bankSafetyScore, behavior);
  const summary = JSON.stringify({
    finalScore: score,
    bankSafety: bank.bankSafetyScore,
    behavior,
    weights: { bank: 0.6, behavior: 0.4 },
    threshold: THRESHOLD,
  });

  if (score < THRESHOLD) {
    return c.json({ error: "Risk score below threshold", finalScore: score, summary: JSON.parse(summary) }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status, risk_assessment_score, risk_assessment_summary)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(id, userId, body.amount, FLAT_INTEREST_RATE, body.termMonths, score, summary)
    .run();

  return c.json({ id, status: "pending", riskScore: score }, 201);
});

loans.get("/", requireAuth, async (c) => {
  const status = c.req.query("status");
  const isStaff = c.var.role === "officer" || c.var.role === "admin";

  let query = "SELECT * FROM loans";
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (!isStaff) {
    conditions.push("borrower_id = ?");
    binds.push(c.var.userId);
  }
  if (status) {
    conditions.push("status = ?");
    binds.push(status);
  }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC";

  const { results } = await c.env.DB.prepare(query)
    .bind(...binds)
    .all();
  return c.json({ loans: results });
});

loans.get("/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ?")
    .bind(loanId)
    .first<{ borrower_id: string }>();
  const isStaff = c.var.role === "officer" || c.var.role === "admin";
  if (!loan || (!isStaff && loan.borrower_id !== c.var.userId)) {
    return c.json({ error: "Loan not found" }, 404);
  }

  const { results: installments } = await c.env.DB.prepare(
    "SELECT * FROM installments WHERE loan_id = ? ORDER BY installment_number"
  )
    .bind(loanId)
    .all();

  return c.json({ loan, installments });
});

loans.post("/:id/approve", requireAuth, requireRole("officer", "admin"), async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare(
    "SELECT id, amount, interest_rate, term_months FROM loans WHERE id = ? AND status = 'pending'"
  )
    .bind(loanId)
    .first<{ id: string; amount: number; interest_rate: number; term_months: number }>();

  if (!loan) {
    return c.json({ error: "Pending loan not found" }, 404);
  }

  const schedule = generateInstallments(loan.amount, loan.interest_rate, loan.term_months, new Date());

  // UPDATE's WHERE status='pending' is the real concurrency guard (atomic
  // against the row at write time); the SELECT above only filters the common case.
  // D1 batch() runs every statement regardless of an earlier one's rows-affected, so a
  // racing request can still leave orphaned installments/transaction rows here. Closing
  // that fully needs all three statements conditioned on the UPDATE (e.g. a stored
  // procedure/CTE) — out of scope; this narrows the window and reports the conflict
  // instead of returning a false success.
  const [updateResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE loans SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
    ).bind(c.var.userId, loanId),
    ...schedule.map((installment) =>
      c.env.DB.prepare(
        "INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due) VALUES (?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), loanId, installment.installmentNumber, installment.dueDate, installment.amountDue)
    ),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, loan_id, type, amount, payment_method, status) VALUES (?, ?, 'disbursement', ?, 'mock_gateway', 'completed')"
    ).bind(crypto.randomUUID(), loanId, loan.amount),
  ]);

  if (updateResult.meta.changes === 0) {
    return c.json({ error: "Loan no longer pending" }, 409);
  }

  return c.json({ id: loanId, status: "active", installmentCount: schedule.length });
});

loans.post("/:id/reject", requireAuth, requireRole("officer", "admin"), async (c) => {
  const loanId = c.req.param("id");
  // The loans.status CHECK has no 'rejected' value; 'defaulted' is the terminal
  // non-active state. Add a dedicated 'rejected' status via migration if needed later.
  const result = await c.env.DB.prepare(
    "UPDATE loans SET status = 'defaulted', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  )
    .bind(c.var.userId, loanId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Pending loan not found" }, 404);
  }
  return c.json({ id: loanId, status: "defaulted" });
});

loans.post("/:id/installments/:installmentId/pay", requireAuth, async (c) => {
  const loanId = c.req.param("id");
  const installmentId = c.req.param("installmentId");
  const body = await c.req.json<{
    amount: number;
    paymentMethod: "stripe" | "bank_transfer" | "mock_gateway";
  }>();

  const installment = await c.env.DB.prepare(
    "SELECT id, amount_due, amount_paid FROM installments WHERE id = ? AND loan_id = ?"
  )
    .bind(installmentId, loanId)
    .first<{ id: string; amount_due: number; amount_paid: number }>();

  if (!installment) {
    return c.json({ error: "Installment not found" }, 404);
  }

  const newAmountPaid = installment.amount_paid + body.amount;
  const newStatus = newAmountPaid >= installment.amount_due ? "paid" : "partial";

  await c.env.DB.batch([
    c.env.DB.prepare(
      newStatus === "paid"
        ? "UPDATE installments SET amount_paid = ?, status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?"
        : "UPDATE installments SET amount_paid = ?, status = ? WHERE id = ?"
    ).bind(newAmountPaid, newStatus, installmentId),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, loan_id, installment_id, type, amount, payment_method, status) VALUES (?, ?, ?, 'repayment', ?, ?, 'completed')"
    ).bind(crypto.randomUUID(), loanId, installmentId, body.amount, body.paymentMethod),
  ]);

  const unpaidCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM installments WHERE loan_id = ? AND status != 'paid'"
  )
    .bind(loanId)
    .first<{ count: number }>();

  if (unpaidCount?.count === 0) {
    await c.env.DB.prepare(
      "UPDATE loans SET status = 'fully_paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(loanId)
      .run();
  }

  return c.json({ installmentId, status: newStatus });
});

export default loans;
