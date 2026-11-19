import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";

async function borrower() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', 'borrower', CURRENT_TIMESTAMP)")
    .bind(id, `${id}@e.com`)
    .run();
  const token = await signJwt({ sub: id, role: "borrower" }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

const demoEnv = { ...env, DEMO_MODE: "true" };
const offEnv = { ...env, DEMO_MODE: undefined }; // explicit: wrangler may load DEMO_MODE from a local .dev.vars
const post = (path: string, headers: Record<string, string>, e: object, body?: unknown) =>
  app.request(path, { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }, e);

describe("GET /api/config demoMode", () => {
  it("tells the frontend whether demo shortcuts are on", async () => {
    expect((await (await app.request("/api/config", {}, offEnv)).json<{ demoMode: boolean }>()).demoMode).toBe(false);
    expect((await (await app.request("/api/config", {}, demoEnv)).json<{ demoMode: boolean }>()).demoMode).toBe(true);
  });
});

describe("POST /api/demo/complete/:step", () => {
  it("does not exist unless DEMO_MODE is exactly 'true'", async () => {
    const u = await borrower();
    expect((await post("/api/demo/complete/identity", u.headers, offEnv)).status).toBe(404);
    expect((await post("/api/demo/complete/identity", u.headers, { ...env, DEMO_MODE: "1" })).status).toBe(404);
  });

  it("requires sign-in", async () => {
    expect((await post("/api/demo/complete/bank", {}, demoEnv)).status).toBe(401);
  });

  it("rejects an unknown step", async () => {
    const u = await borrower();
    expect((await post("/api/demo/complete/payment", u.headers, demoEnv)).status).toBe(400);
  });

  it("marks bank and identity done so the borrower can apply", async () => {
    const u = await borrower();
    expect((await post("/api/demo/complete/bank", u.headers, demoEnv)).status).toBe(200);
    expect((await post("/api/demo/complete/identity", u.headers, demoEnv)).status).toBe(200);

    const profile = await (await app.request("/api/profile", { headers: u.headers }, env)).json<{ kycStatus: string; bankConnected: boolean }>();
    expect(profile).toMatchObject({ kycStatus: "approved", bankConnected: true });

    const loan = await post("/api/loans", u.headers, env, { amount: 1000, termMonths: 6 });
    expect(loan.status).toBe(201);
  });
});

describe("POST /api/demo/approve/:id", () => {
  async function pendingLoan(amount: number) {
    const u = await borrower();
    await post("/api/demo/complete/bank", u.headers, demoEnv);
    await post("/api/demo/complete/identity", u.headers, demoEnv);
    const { id } = await (await post("/api/loans", u.headers, env, { amount, termMonths: 6 })).json<{ id: string }>();
    return { u, id };
  }

  it("is off unless DEMO_MODE is on", async () => {
    const { u, id } = await pendingLoan(1000);
    expect((await post(`/api/demo/approve/${id}`, u.headers, offEnv)).status).toBe(404);
  });

  it("refuses while a required deposit is unpaid, then approves once it's paid", async () => {
    const { u, id } = await pendingLoan(6000);
    expect((await post(`/api/demo/approve/${id}`, u.headers, demoEnv)).status).toBe(402);
    await env.DB.prepare("UPDATE loans SET upfront_paid = 1 WHERE id = ?").bind(id).run();
    const res = await post(`/api/demo/approve/${id}`, u.headers, demoEnv);
    expect(res.status).toBe(200);
    const detail = await (await app.request(`/api/loans/${id}`, { headers: u.headers }, env)).json<{ loan: { status: string; upfront_paid: number }; installments: unknown[] }>();
    expect(detail.loan).toMatchObject({ status: "active", upfront_paid: 1 });
    expect(detail.installments).toHaveLength(6);
  });

  it("won't touch someone else's loan", async () => {
    const { id } = await pendingLoan(1000);
    const stranger = await borrower();
    expect((await post(`/api/demo/approve/${id}`, stranger.headers, demoEnv)).status).toBe(404);
  });
});

describe("demo email helpers", () => {
  it("are off unless DEMO_MODE is on", async () => {
    const u = await borrower();
    expect((await post("/api/demo/verify-email", u.headers, offEnv)).status).toBe(404);
    expect((await app.request("/api/demo/outbox", { headers: u.headers }, offEnv)).status).toBe(404);
  });

  it("verify-email marks the caller verified", async () => {
    const u = await borrower();
    await env.DB.prepare("UPDATE users SET email_verified_at = NULL WHERE id = ?").bind(u.id).run();
    expect((await post("/api/demo/verify-email", u.headers, demoEnv)).status).toBe(200);
    const row = await env.DB.prepare("SELECT email_verified_at FROM users WHERE id = ?").bind(u.id).first<{ email_verified_at: string | null }>();
    expect(row!.email_verified_at).not.toBeNull();
  });

  it("outbox lists only the caller's emails, newest first", async () => {
    const u = await borrower();
    const other = await borrower();
    const ins = (id: string, uid: string, tpl: string, at: string) =>
      env.DB.prepare("INSERT INTO email_outbox (id, user_id, to_address, template, subject, html, text, status, created_at) VALUES (?, ?, 'x@e.com', ?, 's', '<p>h</p>', 't', 'logged', ?)").bind(id, uid, tpl, at).run();
    await ins(crypto.randomUUID(), u.id, "verify_email", "2026-01-01 10:00:00");
    await ins(crypto.randomUUID(), u.id, "loan_received", "2026-01-02 10:00:00");
    await ins(crypto.randomUUID(), other.id, "loan_received", "2026-01-03 10:00:00");
    const { emails } = await (await app.request("/api/demo/outbox", { headers: u.headers }, demoEnv)).json<{ emails: { template: string; html: string; subject: string; createdAt: string }[] }>();
    expect(emails.map((e) => e.template)).toEqual(["loan_received", "verify_email"]);
    expect(emails[0]).toMatchObject({ html: "<p>h</p>", subject: "s" });
  });
});

describe("POST /api/demo/deposit/:id", () => {
  async function bigLoan() {
    const u = await borrower();
    await post("/api/demo/complete/bank", u.headers, demoEnv);
    await post("/api/demo/complete/identity", u.headers, demoEnv);
    const { id } = await (await post("/api/loans", u.headers, env, { amount: 6000, termMonths: 6 })).json<{ id: string }>();
    return { u, id };
  }

  it("is off unless DEMO_MODE is on", async () => {
    const { u, id } = await bigLoan();
    expect((await post(`/api/demo/deposit/${id}`, u.headers, offEnv)).status).toBe(404);
  });

  it("pays the borrower's own deposit with a receipt, which unlocks demo approve", async () => {
    const { u, id } = await bigLoan();
    const res = await post(`/api/demo/deposit/${id}`, u.headers, demoEnv);
    expect(res.status).toBe(200);
    expect((await res.json<{ documentId?: string }>()).documentId).toBeTruthy();
    expect((await post(`/api/demo/approve/${id}`, u.headers, demoEnv)).status).toBe(200);
  });

  it("refuses a second deposit, a loan without one, and someone else's loan", async () => {
    const { u, id } = await bigLoan();
    await post(`/api/demo/deposit/${id}`, u.headers, demoEnv);
    expect((await post(`/api/demo/deposit/${id}`, u.headers, demoEnv)).status).toBe(409);
    expect((await post(`/api/demo/deposit/${id}`, (await borrower()).headers, demoEnv)).status).toBe(404);
    const small = await borrower();
    await post("/api/demo/complete/bank", small.headers, demoEnv);
    await post("/api/demo/complete/identity", small.headers, demoEnv);
    const sid = (await (await post("/api/loans", small.headers, env, { amount: 1000, termMonths: 6 })).json<{ id: string }>()).id;
    expect((await post(`/api/demo/deposit/${sid}`, small.headers, demoEnv)).status).toBe(409);
  });
});

describe("manual repayment with mock_gateway", () => {
  it("is a demo shortcut: 404 unless DEMO_MODE is on", async () => {
    const u = await borrower();
    const pay = (e: object) => post("/api/loans/x/installments/y/pay", u.headers, e, { amount: 1, paymentMethod: "mock_gateway" });
    expect(await (await pay(offEnv)).json()).toEqual({ error: "Not found" });
    expect(await (await pay(demoEnv)).json()).not.toEqual({ error: "Not found" }); // gets past the gate (then fails: no such loan)
  });
});
