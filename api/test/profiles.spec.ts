import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createProfile, getProfile } from "../src/profiles";

async function insertTestUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'unused-hash', 'borrower')"
  )
    .bind(userId, email)
    .run();
}

describe("createProfile / getProfile", () => {
  it("stores PII + OCR as ciphertext and returns decrypted plaintext on read", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "profile-test@example.com");

    await createProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      address: "123 Main St",
      nationalIdNumber: "A1234567",
      kycDocumentR2Key: `kyc/${userId}/doc-1`,
      ocrExtractedData: JSON.stringify({ firstName: "Jane", nationalIdNumber: "A1234567" }),
    });

    const raw = await env.DB.prepare(
      "SELECT first_name, phone, ocr_extracted_data, kyc_document_r2_key FROM profiles WHERE user_id = ?"
    )
      .bind(userId)
      .first<{ first_name: string; phone: string; ocr_extracted_data: string; kyc_document_r2_key: string }>();
    expect(raw?.first_name).not.toBe("Jane");
    expect(raw?.phone).not.toBe("+15551234567");
    // OCR JSON is encrypted at rest — the raw column must not contain the plaintext field values
    expect(raw?.ocr_extracted_data).not.toContain("Jane");
    expect(raw?.ocr_extracted_data).not.toContain("A1234567");
    // The R2 pointer is stored as plaintext (it is an opaque key, not PII)
    expect(raw?.kyc_document_r2_key).toBe(`kyc/${userId}/doc-1`);

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile).toEqual({
      userId,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      address: "123 Main St",
      nationalIdNumber: "A1234567",
      kycStatus: "pending",
      kycDocumentR2Key: `kyc/${userId}/doc-1`,
      ocrExtractedData: JSON.stringify({ firstName: "Jane", nationalIdNumber: "A1234567" }),
    });
  });

  it("returns null for a user with no profile", async () => {
    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, crypto.randomUUID());
    expect(profile).toBeNull();
  });
});
