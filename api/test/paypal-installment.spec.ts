import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

const paypal = () => fetchMock.get("https://api-m.sandbox.paypal.com");
const token = () => paypal().intercept({ method: "POST", path: "/v1/oauth2/token" }).reply(200, { access_token: "tok" });

async function user() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', 'borrower', CURRENT_TIMESTAMP)")
    .bind(id, `${id}@e.com`)
    .run();
  const t = await signJwt({ sub: id, role: "borrower" }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } };
}

/** Active $300 loan, 3 installments of $105; the first has `paid` already paid. */
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
      .bind(id, loanId, n, `2099-0${n}-01`, n === 1 ? paid : 0, n === 1 && paid >= 105 ? "paid" : n === 1 && paid ? "partial" : "unpaid")
      .run();
  }
  return { loanId, installmentId: ids[0] };
}

const post = (path: string, h: Record<string, string>, body: unknown) =>
  app.request(path, { method: "POST", headers: h, body: JSON.stringify(body) }, env);

const captured = (customId: string, status = "COMPLETED", value = "100.00") => ({
  id: "ORDER1",
  status,
  purchase_units: [{ payments: { captures: [{ id: "CAP1", status, custom_id: customId, amount: { currency_code: "USD", value } }] } }],
});

describe("POST /api/payments/paypal/installment-order", () => {
  it("orders what is left on the installment, tagged with loan, installment and user", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id, 5);
    token();
    paypal()
      .intercept({
        method: "POST",
        path: "/v2/checkout/orders",
        body: (raw) => {
          const u = JSON.parse(String(raw)).purchase_units[0];
          return u.amount.value === "100.00" && u.custom_id === `${loanId}:${installmentId}:${b.id}`;
        },
      })
      .reply(201, { id: "ORDER1", status: "CREATED" });

    const res = await post("/api/payments/paypal/installment-order", b.headers, { loanId, installmentId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "ORDER1", amount: 100 });
  });

  it("hides other borrowers' installments", async () => {
    const owner = await user();
    const other = await user();
    const { loanId, installmentId } = await activeLoan(owner.id);
    expect((await post("/api/payments/paypal/installment-order", other.headers, { loanId, installmentId })).status).toBe(404);
  });

  it("refuses an installment that is already paid", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id, 105);
    expect((await post("/api/payments/paypal/installment-order", b.headers, { loanId, installmentId })).status).toBe(409);
  });
});

describe("POST /api/payments/paypal/installment-capture", () => {
  it("captures, records the payment once with method paypal, and returns the receipt", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id, 5);
    token();
    paypal().intercept({ method: "POST", path: "/v2/checkout/orders/ORDER1/capture" }).reply(201, captured(`${loanId}:${installmentId}:${b.id}`));

    const res = await post("/api/payments/paypal/installment-capture", b.headers, { loanId, installmentId, orderId: "ORDER1" });
    expect(res.status).toBe(200);
    const body = await res.json<{ installmentId: string; status: string; documentId: string }>();
    expect(body).toMatchObject({ installmentId, status: "paid" });
    expect(typeof body.documentId).toBe("string");

    const tx = await env.DB.prepare("SELECT payment_method, amount FROM transactions WHERE installment_id = ?").bind(installmentId).all<{ payment_method: string; amount: number }>();
    expect(tx.results).toEqual([{ payment_method: "paypal", amount: 100 }]);

    // a second capture of the same order does not call PayPal again or double-record
    const again = await post("/api/payments/paypal/installment-capture", b.headers, { loanId, installmentId, orderId: "ORDER1" });
    expect(again.status).toBe(200);
    expect((await again.json<{ documentId: string }>()).documentId).toBe(body.documentId);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM transactions WHERE installment_id = ?").bind(installmentId).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("rejects an order that was made for something else", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id);
    token();
    paypal().intercept({ method: "POST", path: "/v2/checkout/orders/ORDER1/capture" }).reply(201, captured(`${loanId}:other:${b.id}`));
    expect((await post("/api/payments/paypal/installment-capture", b.headers, { loanId, installmentId, orderId: "ORDER1" })).status).toBe(403);
  });

  it("returns 402 when PayPal did not complete the capture", async () => {
    const b = await user();
    const { loanId, installmentId } = await activeLoan(b.id);
    token();
    paypal().intercept({ method: "POST", path: "/v2/checkout/orders/ORDER1/capture" }).reply(201, captured(`${loanId}:${installmentId}:${b.id}`, "PENDING"));
    expect((await post("/api/payments/paypal/installment-capture", b.headers, { loanId, installmentId, orderId: "ORDER1" })).status).toBe(402);
  });
});
