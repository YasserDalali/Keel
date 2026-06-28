import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { saveDocument } from "../src/documents/store";

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
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
