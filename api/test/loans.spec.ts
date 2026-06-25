import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireRole } from "../src/middleware/requireRole";
import type { Bindings, Variables } from "../src/types";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

async function authHeaderFor(userId: string, role: "borrower" | "officer" | "admin"): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

async function insertTestUser(userId: string, email: string, role: "borrower" | "officer" | "admin"): Promise<void> {
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'unused', ?)")
    .bind(userId, email, role)
    .run();
}

describe("POST /api/loans", () => {
  it("creates a pending loan request for the authenticated borrower", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "loan-borrower@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const res = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1200, termMonths: 6 }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(typeof body.id).toBe("string");
  });

  it("rejects a non-positive amount with 400", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "bad-amount@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const res = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -5, termMonths: 6 }),
      },
      env
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/loans/:id", () => {
  it("returns the loan and its (empty, pre-approval) installments", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "loan-getter@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 500, termMonths: 3 }),
      },
      env
    );
    const { id } = await createRes.json<{ id: string }>();

    const getRes = await app.request(`/api/loans/${id}`, { headers }, env);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.loan.id).toBe(id);
    expect(body.installments).toEqual([]);
  });
});

describe("POST /api/loans/:id/approve", () => {
  it("activates the loan, creates installments, and records a disbursement", async () => {
    const borrowerId = crypto.randomUUID();
    const officerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "approve-borrower@example.com", "borrower");
    await insertTestUser(officerId, "approve-officer@example.com", "officer");
    const borrowerHeaders = await authHeaderFor(borrowerId, "borrower");
    const officerHeaders = await authHeaderFor(officerId, "officer");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...borrowerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1200, termMonths: 6 }),
      },
      env
    );
    const { id: loanId } = await createRes.json<{ id: string }>();

    const approveRes = await app.request(
      `/api/loans/${loanId}/approve`,
      { method: "POST", headers: officerHeaders },
      env
    );
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.status).toBe("active");
    expect(approveBody.installmentCount).toBe(6);

    const getRes = await app.request(`/api/loans/${loanId}`, { headers: borrowerHeaders }, env);
    const getBody = await getRes.json();
    expect(getBody.loan.status).toBe("active");
    expect(getBody.installments).toHaveLength(6);

    const txRes = await env.DB.prepare(
      "SELECT type, amount FROM transactions WHERE loan_id = ?"
    )
      .bind(loanId)
      .all<{ type: string; amount: number }>();
    expect(txRes.results).toEqual([{ type: "disbursement", amount: 1200 }]);
  });

  it("rejects re-approving an already-active loan with a non-success status", async () => {
    const borrowerId = crypto.randomUUID();
    const officerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "double-approve-borrower@example.com", "borrower");
    await insertTestUser(officerId, "double-approve-officer@example.com", "officer");
    const borrowerHeaders = await authHeaderFor(borrowerId, "borrower");
    const officerHeaders = await authHeaderFor(officerId, "officer");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...borrowerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1200, termMonths: 6 }),
      },
      env
    );
    const { id: loanId } = await createRes.json<{ id: string }>();

    const firstApprove = await app.request(
      `/api/loans/${loanId}/approve`,
      { method: "POST", headers: officerHeaders },
      env
    );
    expect(firstApprove.status).toBe(200);

    const secondApprove = await app.request(
      `/api/loans/${loanId}/approve`,
      { method: "POST", headers: officerHeaders },
      env
    );
    expect(secondApprove.status).not.toBe(200);
    expect([404, 409]).toContain(secondApprove.status);

    const installmentsRes = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM installments WHERE loan_id = ?"
    )
      .bind(loanId)
      .first<{ count: number }>();
    expect(installmentsRes?.count).toBe(6);
  });

  it("rejects approval from a borrower with 403", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "no-approve@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 500, termMonths: 3 }),
      },
      env
    );
    const { id: loanId } = await createRes.json<{ id: string }>();

    const approveRes = await app.request(
      `/api/loans/${loanId}/approve`,
      { method: "POST", headers },
      env
    );
    expect(approveRes.status).toBe(403);
  });
});

describe("requireRole", () => {
  function buildTestApp() {
    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.use("*", async (c, next) => {
      c.set("role", c.req.header("X-Test-Role") as Variables["role"]);
      await next();
    });
    app.get("/officer-only", requireRole("officer", "admin"), (c) => c.json({ ok: true }));
    return app;
  }

  it("allows a role in the allowed list", async () => {
    const app = buildTestApp();
    const res = await app.request("/officer-only", { headers: { "X-Test-Role": "officer" } }, env);
    expect(res.status).toBe(200);
  });

  it("rejects a role not in the allowed list with 403", async () => {
    const app = buildTestApp();
    const res = await app.request("/officer-only", { headers: { "X-Test-Role": "borrower" } }, env);
    expect(res.status).toBe(403);
  });
});
