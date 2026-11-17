import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

async function borrower() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'h', 'borrower')")
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

  it("approves the borrower's own pending loan, covering a required deposit", async () => {
    const { u, id } = await pendingLoan(6000);
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
