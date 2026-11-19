import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";
import { upsertPlaidItem } from "./support/fixtures";

type Role = "borrower" | "officer" | "admin";

async function user(role: Role, verified = true) {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', ?, ?)")
    .bind(id, `${id}@e.com`, role, verified ? "2026-01-01 00:00:00" : null)
    .run();
  const token = await signJwt({ sub: id, role }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function borrower() {
  const u = await user("borrower");
  await upsertPlaidItem(env.DB, env.PII_ENCRYPTION_KEY, {
    userId: u.id, itemId: `item-${u.id}`, accessToken: "a", institutionName: "Test Bank", bankSafetyScore: 90, bankSignals: "{}",
  });
  await env.DB.prepare("INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'approved')").bind(u.id).run();
  return u;
}

const post = (path: string, h: Record<string, string>, body?: unknown) =>
  app.request(path, { method: "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) }, env);
const kinds = async (userId: string) =>
  (await env.DB.prepare("SELECT kind FROM notifications WHERE user_id = ? ORDER BY created_at, rowid").bind(userId).all<{ kind: string }>()).results.map((r) => r.kind);
const apply = async (h: Record<string, string>, amount = 300, termMonths = 3) =>
  (await (await post("/api/loans", h, { amount, termMonths })).json<{ id: string }>()).id;

describe("notification events", () => {
  it("tells every officer and admin about a new application", async () => {
    const b = await borrower();
    const o1 = await user("officer");
    const a1 = await user("admin");
    await apply(b.headers);
    expect(await kinds(o1.id)).toEqual(["loan_submitted"]);
    expect(await kinds(a1.id)).toEqual(["loan_submitted"]);
    expect(await kinds(b.id)).toEqual([]);
  });

  it("tells the borrower when a loan is approved, then about each payment (staff too)", async () => {
    const b = await borrower();
    const o = await user("officer");
    const id = await apply(b.headers);
    expect((await post(`/api/loans/${id}/approve`, o.headers)).status).toBe(200);
    expect(await kinds(b.id)).toEqual(["loan_approved"]);

    const { installments } = await (await app.request(`/api/loans/${id}`, { headers: b.headers }, env)).json<{ installments: { id: string }[] }>();
    const pay = await post(`/api/loans/${id}/installments/${installments[0].id}/pay`, b.headers, { amount: 105, paymentMethod: "mock_gateway" });
    expect(pay.status).toBe(200);
    expect(await kinds(b.id)).toEqual(["loan_approved", "payment_received"]);
    expect(await kinds(o.id)).toEqual(["loan_submitted", "payment_received"]);
  });

  it("tells the borrower about a decline and staff about a cancellation", async () => {
    const b = await borrower();
    const o = await user("officer");
    const declined = await apply(b.headers);
    await post(`/api/loans/${declined}/reject`, o.headers);
    expect(await kinds(b.id)).toEqual(["loan_declined"]);

    const cancelled = await apply(b.headers);
    await post(`/api/loans/${cancelled}/cancel`, b.headers);
    expect(await kinds(o.id)).toEqual(["loan_submitted", "loan_submitted", "loan_cancelled"]);
  });
});

describe("GET/POST /api/notifications", () => {
  it("lists newest first with an unread count, and marks read by id or all at once", async () => {
    const b = await borrower();
    const o = await user("officer");
    await apply(b.headers);
    await apply(b.headers, 400);
    await apply(b.headers, 500);

    const list = async () =>
      (await app.request("/api/notifications", { headers: o.headers }, env)).json<{
        notifications: { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[];
        unread: number;
      }>();
    let body = await list();
    expect(body.unread).toBe(3);
    expect(body.notifications).toHaveLength(3);
    expect(body.notifications[0]).toMatchObject({ kind: "loan_submitted", readAt: null });
    expect(body.notifications[0].link).toMatch(/^\/app\/loans\//);

    expect((await post("/api/notifications/read", o.headers, { ids: [body.notifications[0].id] })).status).toBe(200);
    body = await list();
    expect(body.unread).toBe(2);

    await post("/api/notifications/read", o.headers, {});
    expect((await list()).unread).toBe(0);
  });

  it("can't mark someone else's notifications", async () => {
    const b = await borrower();
    const o = await user("officer");
    const intruder = await user("borrower");
    await apply(b.headers);
    const [{ id }] = (await env.DB.prepare("SELECT id FROM notifications WHERE user_id = ?").bind(o.id).all<{ id: string }>()).results;
    await post("/api/notifications/read", intruder.headers, { ids: [id] });
    const row = await env.DB.prepare("SELECT read_at FROM notifications WHERE id = ?").bind(id).first<{ read_at: string | null }>();
    expect(row?.read_at).toBeNull();
  });

  it("requires sign-in", async () => {
    expect((await app.request("/api/notifications", {}, env)).status).toBe(401);
  });
});
