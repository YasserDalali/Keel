import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireRole } from "../src/middleware/requireRole";
import type { Bindings, Variables } from "../src/types";

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
