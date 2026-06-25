import { env, fetchMock } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

beforeAll(() => {
  fetchMock.activate();
  stubGemini();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function insertTestUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'unused-hash', 'borrower')"
  )
    .bind(userId, email)
    .run();
}

async function authHeaderFor(userId: string): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role: "borrower" }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

// Fake Gemini OCR via the workers pool's undici mock agent. Intercepting outbound
// requests this way (rather than spying on globalThis.fetch) keeps the pool's
// isolated-storage teardown intact. .persist() serves every upload in the suite.
function stubGemini(): void {
  fetchMock
    .get("https://generativelanguage.googleapis.com")
    .intercept({
      method: "POST",
      path: (p) => p.startsWith("/v1beta/models/gemini-2.5-flash:generateContent"),
    })
    .reply(200, {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"firstName":"Jane","lastName":"Doe","nationalIdNumber":"A1234567","dob":"1990-05-01"}',
              },
            ],
          },
        },
      ],
    })
    .persist();
}

function uploadForm(): FormData {
  const fd = new FormData();
  fd.append("file", new File([PNG], "id.png", { type: "image/png" }));
  return fd;
}

describe("POST /api/kyc/upload", () => {

  it("stores the image in R2, runs OCR, writes a draft, and returns suggestions", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "kyc-upload@example.com");
    const headers = await authHeaderFor(userId);

    const res = await app.request(
      "/api/kyc/upload",
      { method: "POST", headers, body: uploadForm() },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ suggestions: Record<string, string>; r2Key: string }>();
    expect(body.suggestions.firstName).toBe("Jane");
    expect(body.suggestions.nationalIdNumber).toBe("A1234567");
    expect(body.r2Key).toBe(`kyc/${userId}/${body.r2Key.split("/")[2]}`);

    // Image is in R2 (head, not get — leaving a body stream open breaks storage teardown)
    const object = await env.KYC_BUCKET.head(body.r2Key);
    expect(object).not.toBeNull();

    // Draft is in KV
    const draft = await env.LOAN_CACHE.get(`kyc:draft:${userId}`);
    expect(draft).not.toBeNull();
    expect(JSON.parse(draft!).r2Key).toBe(body.r2Key);
  });

  it("rejects a non-image file with 415", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "kyc-badtype@example.com");
    const headers = await authHeaderFor(userId);

    const fd = new FormData();
    fd.append("file", new File([PNG], "id.txt", { type: "text/plain" }));

    const res = await app.request("/api/kyc/upload", { method: "POST", headers, body: fd }, env);
    expect(res.status).toBe(415);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/kyc/upload", { method: "POST", body: uploadForm() }, env);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/kyc/confirm", () => {

  async function uploadFor(userId: string): Promise<void> {
    const headers = await authHeaderFor(userId);
    await app.request("/api/kyc/upload", { method: "POST", headers, body: uploadForm() }, env);
  }

  const confirmBody = {
    firstName: "Jane",
    lastName: "Doe",
    nationalIdNumber: "A1234567",
    phone: "+15551234567",
    address: "123 Main St",
  };

  it("creates the encrypted profile and clears the draft", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "kyc-confirm@example.com");
    await uploadFor(userId);
    const headers = await authHeaderFor(userId);

    const res = await app.request(
      "/api/kyc/confirm",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json<{ userId: string; kycStatus: string }>();
    expect(body.kycStatus).toBe("pending");

    // Profile row exists, PII is ciphertext, kyc_status defaulted to pending
    const raw = await env.DB.prepare(
      "SELECT first_name, ocr_extracted_data, kyc_status, kyc_document_r2_key FROM profiles WHERE user_id = ?"
    )
      .bind(userId)
      .first<{
        first_name: string;
        ocr_extracted_data: string;
        kyc_status: string;
        kyc_document_r2_key: string;
      }>();
    expect(raw?.first_name).not.toBe("Jane");
    expect(raw?.ocr_extracted_data).not.toContain("Jane");
    expect(raw?.ocr_extracted_data).not.toContain("A1234567");
    expect(raw?.kyc_status).toBe("pending");
    expect(raw?.kyc_document_r2_key).toContain(`kyc/${userId}/`);

    // Draft is gone
    expect(await env.LOAN_CACHE.get(`kyc:draft:${userId}`)).toBeNull();
  });

  it("returns 400 when there is no pending upload draft", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "kyc-nodraft@example.com");
    const headers = await authHeaderFor(userId);

    const res = await app.request(
      "/api/kyc/confirm",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when a profile already exists", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "kyc-dup@example.com");
    const headers = await authHeaderFor(userId);

    await uploadFor(userId);
    await app.request(
      "/api/kyc/confirm",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      },
      env
    );

    // Second attempt: re-upload to get a fresh draft, then confirm again
    await uploadFor(userId);
    const second = await app.request(
      "/api/kyc/confirm",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      },
      env
    );
    expect(second.status).toBe(409);
  });
});
