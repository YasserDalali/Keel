import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/contexts/identity/infrastructure/jwt";
import { saveDocument } from "../src/contexts/documents/infrastructure/d1-document-repository";

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

async function authHeader(userId: string, role: "borrower" | "officer" | "admin"): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

describe("saveDocument", () => {
  it("writes the PDF to R2 and inserts a documents row", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "store-test@example.com");
    const docId = crypto.randomUUID();

    await saveDocument(env.DB, env.DOCS_BUCKET, {
      id: docId,
      userId,
      documentType: "account_opened",
      pdfBytes: FAKE_PDF,
    });

    const row = await env.DB.prepare(
      "SELECT id, user_id, document_type, reference_id, r2_key FROM documents WHERE id = ?"
    ).bind(docId).first<{ id: string; user_id: string; document_type: string; reference_id: string | null; r2_key: string }>();
    expect(row?.user_id).toBe(userId);
    expect(row?.document_type).toBe("account_opened");
    expect(row?.reference_id).toBeNull();
    expect(row?.r2_key).toBe(`documents/${userId}/account_opened/${docId}.pdf`);

    const obj = await env.DOCS_BUCKET.head(row!.r2_key);
    expect(obj).not.toBeNull();
  });

  it("stores the referenceId when provided", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "store-ref@example.com");
    const docId = crypto.randomUUID();
    const loanId = crypto.randomUUID();

    await saveDocument(env.DB, env.DOCS_BUCKET, {
      id: docId,
      userId,
      documentType: "loan_agreement",
      referenceId: loanId,
      pdfBytes: FAKE_PDF,
    });

    const row = await env.DB.prepare(
      "SELECT reference_id FROM documents WHERE id = ?"
    ).bind(docId).first<{ reference_id: string }>();
    expect(row?.reference_id).toBe(loanId);
  });
});

describe("GET /api/documents", () => {
  it("returns only own documents for a borrower", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "list-borrower@example.com");
    const otherId = crypto.randomUUID();
    await insertUser(otherId, "list-other@example.com");

    await saveDocument(env.DB, env.DOCS_BUCKET, { id: crypto.randomUUID(), userId, documentType: "account_opened", pdfBytes: FAKE_PDF });
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: crypto.randomUUID(), userId: otherId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request("/api/documents", { headers: await authHeader(userId, "borrower") }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ documents: { userId: string }[] }>();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].userId).toBe(userId);
  });

  it("returns all documents for an admin", async () => {
    const adminId = crypto.randomUUID();
    await insertUser(adminId, "list-admin@example.com");
    const userId = crypto.randomUUID();
    await insertUser(userId, "list-admin-borrower@example.com");

    await saveDocument(env.DB, env.DOCS_BUCKET, { id: crypto.randomUUID(), userId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request("/api/documents", { headers: await authHeader(adminId, "admin") }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ documents: unknown[] }>();
    expect(body.documents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/documents/:id", () => {
  it("returns the PDF for the document owner", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "dl-owner@example.com");
    const docId = crypto.randomUUID();
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: docId, userId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request(`/api/documents/${docId}`, { headers: await authHeader(userId, "borrower") }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns 403 for a different borrower", async () => {
    const ownerId = crypto.randomUUID();
    await insertUser(ownerId, "dl-realowner@example.com");
    const otherId = crypto.randomUUID();
    await insertUser(otherId, "dl-intruder@example.com");
    const docId = crypto.randomUUID();
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: docId, userId: ownerId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request(`/api/documents/${docId}`, { headers: await authHeader(otherId, "borrower") }, env);
    expect(res.status).toBe(403);
  });

  it("returns 200 for an admin fetching any document", async () => {
    const ownerId = crypto.randomUUID();
    await insertUser(ownerId, "dl-admin-owner@example.com");
    const adminId = crypto.randomUUID();
    await insertUser(adminId, "dl-admin@example.com");
    const docId = crypto.randomUUID();
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: docId, userId: ownerId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request(`/api/documents/${docId}`, { headers: await authHeader(adminId, "admin") }, env);
    expect(res.status).toBe(200);
  });

  it("returns 404 for a nonexistent document", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "dl-404@example.com");
    const res = await app.request(`/api/documents/${crypto.randomUUID()}`, { headers: await authHeader(userId, "borrower") }, env);
    expect(res.status).toBe(404);
  });
});
