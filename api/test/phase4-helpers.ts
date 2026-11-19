import { env } from "cloudflare:test";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";

/** UTC calendar day `offset` days from today, as YYYY-MM-DD. */
export const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
/** D1-style timestamp ("YYYY-MM-DD HH:MM:SS") `offset` days from now. */
export const stamp = (offset = 0, time = "12:00:00") => `${day(offset)} ${time}`;

export async function user(role: "borrower" | "officer" | "admin" = "borrower", createdAt?: string) {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, 'h', ?, COALESCE(?, CURRENT_TIMESTAMP))")
    .bind(id, `${id}@e.com`, role, createdAt ?? null)
    .run();
  const token = await signJwt({ sub: id, role }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

type LoanOpts = {
  amount?: number; term?: number; status?: string; createdAt?: string; approvedAt?: string | null; cancelledAt?: string | null;
  upfrontRequired?: number; upfrontAmount?: number; upfrontPaid?: number; upfrontMethod?: string | null; upfrontPaidAt?: string | null;
};

export async function loan(borrowerId: string, o: LoanOpts = {}) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status, created_at, approved_at, cancelled_at,
       upfront_required, upfront_amount, upfront_paid, upfront_payment_method, upfront_paid_at)
     VALUES (?, ?, ?, 0.05, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, borrowerId, o.amount ?? 1000, o.term ?? 3, o.status ?? "active", o.createdAt ?? stamp(-60), o.approvedAt === undefined ? stamp(-59) : o.approvedAt,
      o.cancelledAt ?? null, o.upfrontRequired ?? 0, o.upfrontAmount ?? 0, o.upfrontPaid ?? 0, o.upfrontMethod ?? null, o.upfrontPaidAt ?? null)
    .run();
  return id;
}

export async function installment(loanId: string, n: number, o: { due: string; amountDue?: number; amountPaid?: number; status?: string; paidAt?: string | null }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due, amount_paid, status, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, loanId, n, o.due, o.amountDue ?? 350, o.amountPaid ?? 0, o.status ?? "unpaid", o.paidAt ?? null)
    .run();
  return id;
}

export async function txn(loanId: string, o: { type: string; amount: number; method?: string; installmentId?: string; createdAt?: string }) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO transactions (id, loan_id, installment_id, type, amount, payment_method, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)"
  )
    .bind(id, loanId, o.installmentId ?? null, o.type, o.amount, o.method ?? "mock_gateway", o.createdAt ?? stamp(0))
    .run();
  return id;
}

export const get = (path: string, headers: Record<string, string>) => app.request(path, { headers }, env);
export const put = (path: string, headers: Record<string, string>, body: unknown) =>
  app.request(path, { method: "PUT", headers, body: JSON.stringify(body) }, env);
