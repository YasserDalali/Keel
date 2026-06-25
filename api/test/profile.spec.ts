import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

async function user(role: "borrower" | "officer" = "borrower") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'h', ?)")
    .bind(id, `${id}@e.com`, role)
    .run();
  const token = await signJwt({ sub: id, role }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}` } };
}

describe("GET /api/auth/me", () => {
  it("returns the current user's id, email, role", async () => {
    const u = await user("officer");
    const res = await app.request("/api/auth/me", { headers: u.headers }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ userId: string; role: string; email: string }>();
    expect(body.userId).toBe(u.id);
    expect(body.role).toBe("officer");
    expect(body.email).toBe(`${u.id}@e.com`);
  });

  it("401 without auth", async () => {
    const res = await app.request("/api/auth/me", {}, env);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/profile", () => {
  it("reports no profile / no bank for a fresh user", async () => {
    const u = await user();
    const res = await app.request("/api/profile", { headers: u.headers }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ profile: unknown; bankConnected: boolean }>();
    expect(body.profile).toBeNull();
    expect(body.bankConnected).toBe(false);
  });
});
