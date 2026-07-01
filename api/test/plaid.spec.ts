import { env, fetchMock } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

beforeAll(() => fetchMock.activate());
beforeEach(() => fetchMock.assertNoPendingInterceptors());

async function insertTestUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'h', 'borrower')"
  )
    .bind(userId, email)
    .run();
}
async function authHeaderFor(userId: string): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role: "borrower" }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

// Stub Plaid token exchange + balance fetch (the two calls the route makes).
function stubPlaid(accounts: unknown[]): void {
  const base = new URL(env.PLAID_BASE_URL);
  const pool = fetchMock.get(base.origin);
  pool
    .intercept({ method: "POST", path: "/item/public_token/exchange" })
    .reply(200, { access_token: "access-sandbox-secret-123", item_id: "item-1" });
  pool
    .intercept({ method: "POST", path: "/accounts/balance/get" })
    .reply(200, { accounts });
}

const RICH = [
  { name: "Checking", type: "depository", subtype: "checking", balances: { available: 15000, current: 15000 } },
];

describe("POST /api/plaid/connect", () => {
  it("exchanges public token, stores an encrypted item, returns the bank score", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "plaid@example.com");
    stubPlaid(RICH);

    const res = await app.request(
      "/api/plaid/connect",
      {
        method: "POST",
        headers: { ...(await authHeaderFor(userId)), "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken: "public-sandbox-x" }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ bankSafetyScore: number }>();
    expect(body.bankSafetyScore).toBe(90);

    const raw = await env.DB.prepare(
      "SELECT access_token, bank_safety_score FROM plaid_items WHERE user_id = ?"
    )
      .bind(userId)
      .first<{ access_token: string; bank_safety_score: number }>();
    expect(raw?.access_token).not.toContain("access-sandbox-secret-123");
    expect(raw?.bank_safety_score).toBe(90);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/plaid/connect", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });
});
