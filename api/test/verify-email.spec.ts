import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";

const json = { "Content-Type": "application/json" };
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function register() {
  const email = `v-${crypto.randomUUID()}@example.com`;
  const res = await app.request("/api/auth/register", { method: "POST", headers: json, body: JSON.stringify({ email, password: "correct-horse-battery", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }) }, env);
  expect(res.status).toBe(201);
  const { id } = await res.json<{ id: string }>();
  const token = await signJwt({ sub: id, role: "borrower" }, env.JWT_SECRET, 3600);
  return { id, email, headers: { ...json, Authorization: `Bearer ${token}` } };
}

const me = async (h: Record<string, string>) => (await app.request("/api/auth/me", { headers: h }, env)).json<{ emailVerified: boolean }>();
const verify = (token: string) => app.request("/api/auth/verify-email", { method: "POST", headers: json, body: JSON.stringify({ token }) }, env);
async function linkToken(userId: string) {
  const row = await env.DB.prepare("SELECT text FROM email_outbox WHERE user_id = ? AND template = 'verify_email' ORDER BY created_at DESC").bind(userId).first<{ text: string }>();
  return new URL(row!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
}

describe("email verification", () => {
  it("register sends a verification email and the account starts unverified", async () => {
    const u = await register();
    expect((await me(u.headers)).emailVerified).toBe(false);
    const token = await linkToken(u.id);
    expect(token.length).toBeGreaterThan(30);
    const stored = await env.DB.prepare("SELECT token_hash FROM email_tokens WHERE user_id = ?").bind(u.id).first<{ token_hash: string }>();
    expect(stored!.token_hash).toBe(await sha256(token)); // only the hash is stored
  });

  it("verifies once, then refuses the same token", async () => {
    const u = await register();
    const token = await linkToken(u.id);
    expect((await verify(token)).status).toBe(200);
    expect((await me(u.headers)).emailVerified).toBe(true);
    expect((await verify(token)).status).toBe(400);
  });

  it("refuses an expired or unknown token", async () => {
    const u = await register();
    const raw = "expired-token-value-xxxxxxxxxxxxxxxxxxxx";
    await env.DB.prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'verify_email', '2020-01-01 00:00:00')").bind(await sha256(raw), u.id).run();
    expect((await verify(raw)).status).toBe(400);
    expect((await verify("nope")).status).toBe(400);
    expect((await me(u.headers)).emailVerified).toBe(false);
  });

  it("throttles resend to once a minute", async () => {
    const u = await register();
    const resend = () => app.request("/api/auth/resend-verification", { method: "POST", headers: u.headers }, env);
    expect((await resend()).status).toBe(200);
    expect((await resend()).status).toBe(429);
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE user_id = ? AND template = 'verify_email'").bind(u.id).first<{ n: number }>())!;
    expect(n).toBe(2); // register + one resend
  });
});
