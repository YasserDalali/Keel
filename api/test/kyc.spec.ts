import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

const didit = () => fetchMock.get(new URL(env.DIDIT_SESSION_CREATE_URL).origin);
const sessionPath = new URL(env.DIDIT_SESSION_CREATE_URL).pathname;

async function user() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', 'borrower', CURRENT_TIMESTAMP)")
    .bind(id, `${id}@e.com`)
    .run();
  const t = await signJwt({ sub: id, role: "borrower" }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${t}` } };
}
const kycOf = (id: string) =>
  env.DB.prepare("SELECT kyc_status, didit_session_id FROM profiles WHERE user_id = ?").bind(id).first<{ kyc_status: string; didit_session_id: string }>();

describe("POST /api/kyc/session", () => {
  it("remembers the Didit session so the result can be fetched later", async () => {
    const u = await user();
    didit().intercept({ method: "POST", path: sessionPath }).reply(200, { session_id: "s-1", session_token: "t", url: "https://verify.didit.me/session/x", status: "Not Started" });
    const res = await app.request("/api/kyc/session", { method: "POST", headers: u.headers }, env);
    expect(res.status).toBe(200);
    expect(await kycOf(u.id)).toMatchObject({ kyc_status: "pending", didit_session_id: "s-1" });
  });
});

describe("POST /api/kyc/session on a verified user", () => {
  it("keeps the verified status", async () => {
    const u = await user();
    await env.DB.prepare("INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'approved')").bind(u.id).run();
    didit().intercept({ method: "POST", path: sessionPath }).reply(200, { session_id: "s-9", session_token: "t", url: "u", status: "Not Started" });
    await app.request("/api/kyc/session", { method: "POST", headers: u.headers }, env);
    expect(await kycOf(u.id)).toMatchObject({ kyc_status: "approved", didit_session_id: "s-9" });
  });
});

describe("POST /api/kyc/refresh", () => {
  async function started(status = "Not Started") {
    const u = await user();
    didit().intercept({ method: "POST", path: sessionPath }).reply(200, { session_id: "s-2", session_token: "t", url: "u", status });
    await app.request("/api/kyc/session", { method: "POST", headers: u.headers }, env);
    return u;
  }

  it("asks Didit for the decision and stores it", async () => {
    const u = await started();
    didit().intercept({ method: "GET", path: `${sessionPath}s-2/decision/` }).reply(200, { session_id: "s-2", status: "Approved" });
    const res = await app.request("/api/kyc/refresh", { method: "POST", headers: u.headers }, env);
    expect(await res.json()).toEqual({ kycStatus: "approved" });
    expect((await kycOf(u.id))?.kyc_status).toBe("approved");
  });

  it("returns the stored status when there's no session yet", async () => {
    const u = await user();
    const res = await app.request("/api/kyc/refresh", { method: "POST", headers: u.headers }, env);
    expect(await res.json()).toEqual({ kycStatus: null });
  });

  it("says so when Didit can't be reached, keeping the status", async () => {
    const u = await started();
    didit().intercept({ method: "GET", path: `${sessionPath}s-2/decision/` }).reply(500, "boom");
    const res = await app.request("/api/kyc/refresh", { method: "POST", headers: u.headers }, env);
    expect(res.status).toBe(502);
    expect((await kycOf(u.id))?.kyc_status).toBe("pending");
  });
});
