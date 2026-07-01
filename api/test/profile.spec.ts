import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";
import { getProfile } from "../src/profiles";

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

describe("PUT /api/profile", () => {
  it("creates a profile when none exists", async () => {
    const u = await user();

    const res = await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { ...u.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Alice", lastName: "Smith",
          phone: "0600000001", address: "1 Rue de la Paix",
          nationalIdNumber: "AB123456",
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    expect((await res.json() as { ok: boolean }).ok).toBe(true);

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, u.id);
    expect(profile?.firstName).toBe("Alice");
    expect(profile?.lastName).toBe("Smith");
  });

  it("updates an existing profile row", async () => {
    const u = await user();
    await env.DB.prepare(
      "INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'pending')"
    ).bind(u.id).run();

    await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { ...u.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Bob", lastName: "Jones",
          phone: "0600000002", address: "2 Main St",
          nationalIdNumber: "CD789012",
        }),
      },
      env
    );

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, u.id);
    expect(profile?.firstName).toBe("Bob");
  });

  it("returns 400 when a field is missing", async () => {
    const u = await user();

    const res = await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { ...u.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Alice" }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "X", lastName: "X", phone: "X", address: "X", nationalIdNumber: "X",
        }),
      },
      env
    );
    expect(res.status).toBe(401);
  });
});
