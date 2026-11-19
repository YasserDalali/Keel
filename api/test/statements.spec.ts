import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";
import { upsertPlaidItem } from "./support/fixtures";

async function user(role: "borrower" | "officer") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, 'h', ?, CURRENT_TIMESTAMP)")
    .bind(id, `${id}@e.com`, role)
    .run();
  const token = await signJwt({ sub: id, role }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

const post = (path: string, h: Record<string, string>, body?: unknown) =>
  app.request(path, { method: "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) }, env);
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Borrower with an approved, part-repaid loan: agreement + one receipt exist. */
async function borrowerWithHistory() {
  const b = await user("borrower");
  const o = await user("officer");
  await upsertPlaidItem(env.DB, env.PII_ENCRYPTION_KEY, {
    userId: b.id, itemId: `item-${b.id}`, accessToken: "a", institutionName: "Test Bank", bankSafetyScore: 90, bankSignals: "{}",
  });
  await env.DB.prepare("INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'approved')").bind(b.id).run();
  const { id: loanId } = await (await post("/api/loans", b.headers, { amount: 300, termMonths: 3 })).json<{ id: string }>();
  await post(`/api/loans/${loanId}/approve`, o.headers);
  const { installments } = await (await app.request(`/api/loans/${loanId}`, { headers: b.headers }, env)).json<{ installments: { id: string }[] }>();
  await post(`/api/loans/${loanId}/installments/${installments[0].id}/pay`, b.headers, { amount: 105, paymentMethod: "mock_gateway" });
  return { b, loanId };
}

type Doc = { id: string; documentType: string; referenceId: string | null; title: string; loanId: string | null; amount: number | null };

describe("POST /api/documents/statement", () => {
  it("generates and saves this month's statement by default", async () => {
    const { b } = await borrowerWithHistory();
    const res = await post("/api/documents/statement", b.headers, {});
    expect(res.status).toBe(200);
    const { document } = await res.json<{ document: Doc }>();
    expect(document).toMatchObject({ documentType: "statement", referenceId: thisMonth() });
    expect(document.title).toMatch(/^Statement · \w+ \d{4}$/);

    const row = await env.DB.prepare("SELECT r2_key, user_id FROM documents WHERE id = ?").bind(document.id).first<{ r2_key: string; user_id: string }>();
    expect(row?.user_id).toBe(b.id);
    expect(await env.DOCS_BUCKET.head(row!.r2_key)).not.toBeNull();
  });

  it("accepts a past month and rejects a malformed one", async () => {
    const { b } = await borrowerWithHistory();
    expect((await post("/api/documents/statement", b.headers, { month: "2026-01" })).status).toBe(200);
    expect((await post("/api/documents/statement", b.headers, { month: "2026-13" })).status).toBe(400);
    expect((await post("/api/documents/statement", b.headers, { month: "Jan" })).status).toBe(400);
  });
});

describe("GET /api/documents details", () => {
  it("titles each document and ties receipts back to their loan", async () => {
    const { b, loanId } = await borrowerWithHistory();
    const { documents } = await (await app.request("/api/documents", { headers: b.headers }, env)).json<{ documents: Doc[] }>();

    const agreement = documents.find((d) => d.documentType === "loan_agreement");
    expect(agreement).toMatchObject({ title: "Loan agreement", loanId, amount: 300 });

    const receipt = documents.find((d) => d.documentType === "payment_receipt");
    expect(receipt).toMatchObject({ title: "Receipt · payment 1 of 3", loanId, amount: 105 });
  });
});
