import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

const stripe = () => fetchMock.get("https://api.stripe.com");

async function user(role: "borrower" | "officer" = "borrower") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', ?, CURRENT_TIMESTAMP)")
    .bind(id, `${id}@e.com`, role)
    .run();
  const token = await signJwt({ sub: id, role }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

/** Active $300 loan over 3 months with installments of $105; the first has `paid` already paid. */
async function activeLoan(borrowerId: string, paid = 0) {
  const loanId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status, approved_at) VALUES (?, ?, 300, 0.05, 3, 'active', CURRENT_TIMESTAMP)"
  ).bind(loanId, borrowerId).run();
  const ids: string[] = [];
  for (let n = 1; n <= 3; n++) {
    const id = crypto.randomUUID();
    ids.push(id);
    await env.DB.prepare("INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due, amount_paid, status) VALUES (?, ?, ?, ?, 105, ?, ?)")
      .bind(id, loanId, n, `2099-0${n}-01`, n === 1 ? paid : 0, n === 1 && paid ? "partial" : "unpaid")
      .run();
  }
  return { loanId, installmentId: ids[0] };
}

const post = (path: string, h: Record<string, string>, body: unknown) =>
  app.request(path, { method: "POST", headers: h, body: JSON.stringify(body) }, env);

describe("POST /api/payments/stripe/installment-intent", () => {
  it("charges what is left on the installment and tags the intent", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id, 5);
    stripe()
      .intercept({
        method: "POST",
        path: "/v1/payment_intents",
        body: (raw) => {
          const p = new URLSearchParams(String(raw));
          return p.get("amount") === "10000" && p.get("metadata[installmentId]") === installmentId && p.get("metadata[loanId]") === loanId && p.get("metadata[userId]") === b.id;
        },
      })
      .reply(200, { id: "pi_1", client_secret: "cs_1" });

    const res = await post("/api/payments/stripe/installment-intent", b.headers, { loanId, installmentId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: "cs_1", intentId: "pi_1", amount: 100 });
  });

  it("only works for the borrower's own loan", async () => {
    const owner = await user();
    const other = await user();
    const { loanId, installmentId } = await activeLoan(owner.id);
    expect((await post("/api/payments/stripe/installment-intent", other.headers, { loanId, installmentId })).status).toBe(404);
  });

  it("refuses an installment that is already paid", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id, 105);
    expect((await post("/api/payments/stripe/installment-intent", b.headers, { loanId, installmentId })).status).toBe(409);
  });
});

describe("POST /api/payments/stripe/installment-confirm", () => {
  function intent(id: string, status: string, metadata: Record<string, string>, amount = 10500) {
    stripe().intercept({ method: "GET", path: `/v1/payment_intents/${id}` }).reply(200, { id, status, amount, amount_received: status === "succeeded" ? amount : 0, metadata });
  }
  const txCount = (installmentId: string) =>
    env.DB.prepare("SELECT COUNT(*) AS n FROM transactions WHERE installment_id = ?").bind(installmentId).first<{ n: number }>();

  it("records the payment once, even if confirmed twice", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id);
    const meta = { loanId, installmentId, userId: b.id };

    intent("pi_ok", "succeeded", meta);
    const first = await post("/api/payments/stripe/installment-confirm", b.headers, { loanId, installmentId, intentId: "pi_ok" });
    expect(first.status).toBe(200);
    const body = await first.json<{ installmentId: string; status: string; documentId: string }>();
    expect(body).toMatchObject({ installmentId, status: "paid" });
    expect(typeof body.documentId).toBe("string");

    intent("pi_ok", "succeeded", meta);
    const second = await post("/api/payments/stripe/installment-confirm", b.headers, { loanId, installmentId, intentId: "pi_ok" });
    expect(second.status).toBe(200);
    expect((await second.json<{ status: string }>()).status).toBe("paid");

    expect((await txCount(installmentId))?.n).toBe(1);
    const tx = await env.DB.prepare("SELECT payment_method, external_reference_id, amount FROM transactions WHERE installment_id = ?").bind(installmentId).first();
    expect(tx).toEqual({ payment_method: "stripe", external_reference_id: "pi_ok", amount: 105 });
    const inst = await env.DB.prepare("SELECT amount_paid, status FROM installments WHERE id = ?").bind(installmentId).first();
    expect(inst).toEqual({ amount_paid: 105, status: "paid" });
  });

  it("rejects an intent made for something else", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id);
    intent("pi_other", "succeeded", { loanId, installmentId: crypto.randomUUID(), userId: b.id });
    expect((await post("/api/payments/stripe/installment-confirm", b.headers, { loanId, installmentId, intentId: "pi_other" })).status).toBe(403);
    expect((await txCount(installmentId))?.n).toBe(0);
  });

  it("rejects a payment that hasn't gone through", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id);
    intent("pi_pending", "requires_payment_method", { loanId, installmentId, userId: b.id });
    expect((await post("/api/payments/stripe/installment-confirm", b.headers, { loanId, installmentId, intentId: "pi_pending" })).status).toBe(402);
    expect((await txCount(installmentId))?.n).toBe(0);
  });
});

describe("deposit paid by card", () => {
  it("alerts staff and issues a deposit receipt", async () => {
    const b = await user();
    const o = await user("officer");
    const loanId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status, upfront_required, upfront_amount) VALUES (?, ?, 6000, 0.05, 12, 'pending', 1, 300)"
    ).bind(loanId, b.id).run();
    stripe().intercept({ method: "GET", path: "/v1/payment_intents/pi_dep" })
      .reply(200, { id: "pi_dep", status: "succeeded", amount: 30000, metadata: { loanId, userId: b.id } });

    expect((await post("/api/payments/stripe/confirm", b.headers, { loanId, intentId: "pi_dep" })).status).toBe(200);
    const staff = await env.DB.prepare("SELECT kind FROM notifications WHERE user_id = ?").bind(o.id).all<{ kind: string }>();
    expect(staff.results.map((r) => r.kind)).toEqual(["deposit_paid"]);
    const doc = await env.DB.prepare("SELECT document_type FROM documents WHERE user_id = ? AND reference_id = ?").bind(b.id, loanId).first<{ document_type: string }>();
    expect(doc?.document_type).toBe("deposit_receipt");
  });
});
