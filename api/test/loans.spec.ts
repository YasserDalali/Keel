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
