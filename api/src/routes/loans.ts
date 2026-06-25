import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateInstallments } from "../loans/amortization";
import type { Bindings, Variables } from "../types";

const FLAT_INTEREST_RATE = 0.05;

const loans = new Hono<{ Bindings: Bindings; Variables: Variables }>();

loans.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; termMonths: number }>();

  if (body.amount <= 0 || body.termMonths <= 0) {
    return c.json({ error: "amount and termMonths must be positive" }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  )
    .bind(id, c.var.userId, body.amount, FLAT_INTEREST_RATE, body.termMonths)
    .run();

  return c.json({ id, status: "pending" }, 201);
});

loans.get("/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first();
  if (!loan) {
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

  // ponytail: UPDATE's WHERE status='pending' is the real concurrency guard (atomic
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
