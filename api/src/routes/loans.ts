import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
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

export default loans;
