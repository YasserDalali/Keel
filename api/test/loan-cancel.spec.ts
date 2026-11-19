import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";
import { upsertPlaidItem } from "./support/fixtures";

async function borrower() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', 'borrower', CURRENT_TIMESTAMP)").bind(id, `${id}@e.com`).run();
  await upsertPlaidItem(env.DB, env.PII_ENCRYPTION_KEY, {
    userId: id, itemId: `item-${id}`, accessToken: "a", institutionName: "Test Bank", bankSafetyScore: 90, bankSignals: "{}",
  });
  await env.DB.prepare("INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'approved')").bind(id).run();
  const token = await signJwt({ sub: id, role: "borrower" }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

const apply = (h: Record<string, string>, amount = 1000) =>
  app.request("/api/loans", { method: "POST", headers: h, body: JSON.stringify({ amount, termMonths: 6 }) }, env);
const cancel = (h: Record<string, string>, id: string) => app.request(`/api/loans/${id}/cancel`, { method: "POST", headers: h }, env);
const loanRow = (id: string) => env.DB.prepare("SELECT status, cancelled_at FROM loans WHERE id = ?").bind(id).first<{ status: string; cancelled_at: string | null }>();

describe("POST /api/loans/:id/cancel", () => {
  it("cancels the borrower's own pending loan", async () => {
    const u = await borrower();
    const { id } = await (await apply(u.headers)).json<{ id: string }>();
    const res = await cancel(u.headers, id);
    expect(res.status).toBe(200);
    const row = await loanRow(id);
    expect(row?.status).toBe("defaulted");
    expect(row?.cancelled_at).not.toBeNull();
  });

  it("hides other borrowers' loans", async () => {
    const owner = await borrower();
    const other = await borrower();
    const { id } = await (await apply(owner.headers)).json<{ id: string }>();
    expect((await cancel(other.headers, id)).status).toBe(404);
    expect((await loanRow(id))?.status).toBe("pending");
  });

  it("refuses once the loan is no longer waiting", async () => {
    const u = await borrower();
    const { id } = await (await apply(u.headers)).json<{ id: string }>();
    await env.DB.prepare("UPDATE loans SET status = 'active' WHERE id = ?").bind(id).run();
    expect((await cancel(u.headers, id)).status).toBe(409);
  });

  it("refuses after the deposit was paid", async () => {
    const u = await borrower();
    const { id } = await (await apply(u.headers, 6000)).json<{ id: string }>();
    await env.DB.prepare("UPDATE loans SET upfront_paid = 1 WHERE id = ?").bind(id).run();
    const res = await cancel(u.headers, id);
    expect(res.status).toBe(409);
    expect((await res.json<{ error: string }>()).error).toMatch(/deposit/i);
  });
});

describe("risk score history", () => {
  it("does not count cancelled or declined applications as defaults", async () => {
    const fresh = await borrower();
    const baseline = (await (await apply(fresh.headers)).json<{ riskScore: number }>()).riskScore;

    const u = await borrower();
    const { id } = await (await apply(u.headers)).json<{ id: string }>();
    await cancel(u.headers, id);
    await env.DB.prepare("INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status) VALUES (?, ?, 500, 0.05, 3, 'defaulted')")
      .bind(crypto.randomUUID(), u.id) // an officer decline: defaulted, never approved
      .run();

    expect((await (await apply(u.headers)).json<{ riskScore: number }>()).riskScore).toBe(baseline);
  });
});

describe("GET /api/loans/:id overdue", () => {
  it("reports a past-due unpaid installment as overdue before the cron runs", async () => {
    const u = await borrower();
    const { id } = await (await apply(u.headers)).json<{ id: string }>();
    await env.DB.prepare("UPDATE loans SET status = 'active', approved_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    await env.DB.prepare("INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due) VALUES (?, ?, 1, '2020-01-01', 175), (?, ?, 2, '2999-01-01', 175)")
      .bind(crypto.randomUUID(), id, crypto.randomUUID(), id)
      .run();
    const body = await (await app.request(`/api/loans/${id}`, { headers: u.headers }, env)).json<{ installments: { status: string }[] }>();
    expect(body.installments.map((i) => i.status)).toEqual(["overdue", "unpaid"]);
  });
});
