import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";
import { getProfile } from "./support/fixtures";

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

describe("GET /api/profile/:userId", () => {
  it("returns decrypted profile for an officer", async () => {
    const officer = await user("officer");
    const borrower = await user();

    const { upsertProfile } = await import("./support/fixtures");
    await upsertProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId: borrower.id,
      firstName: "Carol", lastName: "White",
      phone: "0699000001", address: "3 Oak Ave",
      nationalIdNumber: "EF345678",
    });

    const res = await app.request(`/api/profile/${borrower.id}`, { headers: officer.headers }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { profile: { firstName: string } };
    expect(body.profile.firstName).toBe("Carol");
  });

  it("returns 403 for a borrower", async () => {
    const borrower = await user();
    const res = await app.request(
      `/api/profile/${crypto.randomUUID()}`,
      { headers: borrower.headers },
      env
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when no profile exists for that userId", async () => {
    const officer = await user("officer");
    const res = await app.request(
      `/api/profile/${crypto.randomUUID()}`,
      { headers: officer.headers },
      env
    );
    expect(res.status).toBe(404);
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

describe("GET /api/profile bank and KYC timestamps", () => {
  it("adds the bank connection and kycUpdatedAt", async () => {
    const u = await user();
    const before = await (await app.request("/api/profile", { headers: u.headers }, env)).json<{ bank: unknown; kycUpdatedAt: unknown }>();
    expect(before.bank).toBeNull();
    expect(before.kycUpdatedAt).toBeNull();

    const { upsertPlaidItem } = await import("./support/fixtures");
    await upsertPlaidItem(env.DB, env.PII_ENCRYPTION_KEY, {
      userId: u.id, itemId: "i", accessToken: "a", institutionName: "First Platypus Bank", bankSafetyScore: 72, bankSignals: "{}",
    });
    const { upsertVerificationStatus } = await import("./support/fixtures");
    await upsertVerificationStatus(env.DB, u.id, "approved", "sess");

    const after = await (await app.request("/api/profile", { headers: u.headers }, env)).json<{
      bank: { institutionName: string; safetyScore: number; connectedAt: string | null }; kycUpdatedAt: string | null;
    }>();
    expect(after.bank).toMatchObject({ institutionName: "First Platypus Bank", safetyScore: 72 });
    expect(after.bank.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(after.kycUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
