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

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE loans SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
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

  return c.json({ id: loanId, status: "active", installmentCount: schedule.length });
});

export default loans;
