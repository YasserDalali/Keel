# KYC / OCR Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in borrower uploads a National ID image; Workers AI vision OCR pre-fills name/ID/DOB; the borrower confirms/edits and submits, creating their AES-GCM-encrypted profile flagged `kyc_status='pending'` for later officer review.

**Architecture:** Two `requireAuth`-gated endpoints under `/api/kyc`. `POST /upload` streams the image to R2, runs a pure-seam `extractOcr()` over the `AI` binding, and stashes the R2 key + raw OCR in a short-lived KV draft. `POST /confirm` reads the draft, calls the (extended) `createProfile()` to encrypt and persist the profile + OCR JSON + R2 pointer, and deletes the draft. The non-deterministic vision model is faked in automated tests via an `env.AI` override and verified once for real in a `wrangler dev` smoke test.

**Tech Stack:** Hono, Cloudflare R2 (`KYC_BUCKET`), KV (`LOAN_CACHE`), **Gemini API (`gemini-2.5-flash`, multimodal, called over `fetch`)**, Web Crypto AES-GCM (existing `crypto.ts`), Vitest + `@cloudflare/vitest-pool-workers`.

> **OCR engine swapped (2026-06-25, implemented):** Workers AI was replaced by the Gemini API to eliminate Cloudflare AI (neuron) cost — Gemini's free tier covers it and `gemini-2.5-flash` is multimodal (no separate open-source OCR engine needed). Concrete deltas vs. the task bodies below:
> - `extractOcr(image, mimeType, apiKey)` POSTs the base64 image to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<GEMINI_API_KEY>` and reads `candidates[0].content.parts[0].text`. The `OcrResult` type and the JSON parser are unchanged.
> - `Bindings` gains `GEMINI_API_KEY: string` and drops `AI: Ai`; the `[ai]` block is removed from `wrangler.toml`. `GEMINI_API_KEY` comes from `.dev.vars` locally / `wrangler secret put GEMINI_API_KEY` in prod.
> - Automated tests fake Gemini via the workers pool's undici `fetchMock` (NOT a `globalThis.fetch` spy — that corrupts isolated-storage teardown). R2 existence checks use `.head()` not `.get()` for the same reason.
> - `vitest.config.ts` pins `TURNSTILE_SECRET` to the always-pass test key so the suite stays hermetic regardless of the real secret in `.dev.vars`.
> - **Status: Tasks 1–4 implemented, full suite green (46/46). Task 5 (real-Gemini smoke test) pending a real `GEMINI_API_KEY`.**

## Global Constraints

- Builds on merged work in `main`: `api/src/types.ts` (`Bindings` includes `KYC_BUCKET: R2Bucket`, `AI: Ai`, `LOAN_CACHE: KVNamespace`, `PII_ENCRYPTION_KEY: string`), `api/src/middleware/requireAuth.ts` (sets `c.var.userId`), `api/src/crypto.ts` (`encryptField`/`decryptField`), `api/src/profiles.ts` (`createProfile`/`getProfile`), `api/src/auth/jwt.ts` (`signJwt` — for test fixtures). Do not re-create these.
- No secrets committed. `PII_ENCRYPTION_KEY` is read from `c.env`, supplied locally via the gitignored root `.dev.vars` (already present from the pii-encryption plan) and in production via `wrangler secret put` (already set).
- Encrypted at rest (AES-GCM via `encryptField`): all five PII fields **and** `ocr_extracted_data` (it contains name/ID/DOB). NOT encrypted: `kyc_document_r2_key` (an opaque storage pointer), `kyc_status` (a status enum).
- R2 object key scheme is exactly `kyc/{userId}/{uuid}` in the private bucket `microloans-kyc` (binding `KYC_BUCKET`). Write-only in this plan; officer retrieval is deferred to the `admin-and-zero-trust` plan.
- KV draft key is exactly `kyc:draft:{userId}` with `expirationTtl: 3600` (KV minimum is 60s, so 3600 is valid). Deleted on successful confirm.
- Upload accepts only `image/jpeg` or `image/png`, max 5 MB (`5 * 1024 * 1024` bytes). Reject otherwise before any R2/AI cost.
- Vision model id is exactly `@cf/meta/llama-3.2-11b-vision-instruct`. Turnstile is NOT used on these endpoints — `requireAuth` only.
- `kyc_status` defaults to `'pending'` via the D1 schema default; do not set it explicitly on insert.

---

## File Structure

```
microloans/
├── api/
│   ├── src/
│   │   ├── index.ts                 # MODIFIED: mount /api/kyc
│   │   ├── kyc/
│   │   │   └── ocr.ts               # NEW: extractOcr(image, ai) → OcrResult, plus parser
│   │   ├── routes/
│   │   │   └── kyc.ts               # NEW: POST /upload, POST /confirm
│   │   └── profiles.ts              # MODIFIED: persist kyc_document_r2_key + encrypted ocr_extracted_data
│   └── test/
│       ├── profiles.spec.ts         # MODIFIED: pass + assert the two new fields
│       ├── ocr.spec.ts              # NEW: parser unit tests (fake AI)
│       └── kyc.spec.ts              # NEW: integration (fake AI via env override)
```

---

## Task 1: Extend `profiles.ts` to persist R2 key + encrypted OCR data

**Files:**
- Modify: `api/src/profiles.ts`
- Modify: `api/test/profiles.spec.ts`

**Interfaces:**
- Consumes: `encryptField`/`decryptField` from `api/src/crypto.ts`.
- Produces: extended `ProfileInput` (adds `kycDocumentR2Key: string`, `ocrExtractedData: string`), extended `ProfileRecord` (adds `kycDocumentR2Key: string`, `ocrExtractedData: string`), unchanged signatures `createProfile(db: D1Database, encryptionKey: string, input: ProfileInput): Promise<void>` and `getProfile(db: D1Database, encryptionKey: string, userId: string): Promise<ProfileRecord | null>` — consumed by Task 4's confirm handler.

- [ ] **Step 1: Update the existing test to the new `createProfile`/`getProfile` shape**

Replace the body of the first test in `api/test/profiles.spec.ts` (the "stores PII as ciphertext…" test) and keep the second ("returns null…") test unchanged. The new first test:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- profiles.spec.ts`
Expected: FAIL — `createProfile` rejects the extra fields / `getProfile` result is missing `kycDocumentR2Key` and `ocrExtractedData` (assertion mismatch).

- [ ] **Step 3: Extend `ProfileInput` and `ProfileRecord` in `api/src/profiles.ts`**

```typescript
export type ProfileInput = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
  kycDocumentR2Key: string;
  ocrExtractedData: string;
};

export type ProfileRecord = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
  kycStatus: "pending" | "approved" | "rejected";
  kycDocumentR2Key: string;
  ocrExtractedData: string;
};
```

- [ ] **Step 4: Encrypt the OCR JSON and persist both columns in `createProfile`**

Replace the body of `createProfile` (everything after the function signature line) with:

```typescript
  const [firstName, lastName, phone, address, nationalIdNumber, ocrExtractedData] =
    await Promise.all([
      encryptField(input.firstName, encryptionKey),
      encryptField(input.lastName, encryptionKey),
      encryptField(input.phone, encryptionKey),
      encryptField(input.address, encryptionKey),
      encryptField(input.nationalIdNumber, encryptionKey),
      encryptField(input.ocrExtractedData, encryptionKey),
    ]);

  await db
    .prepare(
      `INSERT INTO profiles
         (user_id, first_name, last_name, phone, address, national_id_number,
          kyc_document_r2_key, ocr_extracted_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.userId,
      firstName,
      lastName,
      phone,
      address,
      nationalIdNumber,
      input.kycDocumentR2Key,
      ocrExtractedData
    )
    .run();
```

- [ ] **Step 5: Select + decrypt the OCR JSON in `getProfile`**

In `getProfile`, change the `SELECT` to include the two new columns, extend the `.first<{...}>()` type with `kyc_document_r2_key: string; ocr_extracted_data: string;`, add `decryptField(row.ocr_extracted_data, encryptionKey)` to the `Promise.all`, and add the two fields to the returned object. The full updated `getProfile`:

```typescript
export async function getProfile(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<ProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, first_name, last_name, phone, address, national_id_number,
              kyc_status, kyc_document_r2_key, ocr_extracted_data
       FROM profiles WHERE user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      first_name: string;
      last_name: string;
      phone: string;
      address: string;
      national_id_number: string;
      kyc_status: "pending" | "approved" | "rejected";
      kyc_document_r2_key: string;
      ocr_extracted_data: string;
    }>();

  if (!row) {
    return null;
  }

  const [firstName, lastName, phone, address, nationalIdNumber, ocrExtractedData] =
    await Promise.all([
      decryptField(row.first_name, encryptionKey),
      decryptField(row.last_name, encryptionKey),
      decryptField(row.phone, encryptionKey),
      decryptField(row.address, encryptionKey),
      decryptField(row.national_id_number, encryptionKey),
      decryptField(row.ocr_extracted_data, encryptionKey),
    ]);

  return {
    userId: row.user_id,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
    kycStatus: row.kyc_status,
    kycDocumentR2Key: row.kyc_document_r2_key,
    ocrExtractedData,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --prefix api -- profiles.spec.ts`
Expected: PASS — both tests in `profiles.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add api/src/profiles.ts api/test/profiles.spec.ts
git commit -m "feat: persist encrypted OCR data and R2 key in profiles"
```

---

## Task 2: OCR extractor module (`extractOcr`)

**Files:**
- Create: `api/src/kyc/ocr.ts`
- Test: `api/test/ocr.spec.ts`

**Interfaces:**
- Consumes: the `Ai` binding type (from `@cloudflare/workers-types`).
- Produces: `OcrResult` type (`{ firstName: string | null; lastName: string | null; nationalIdNumber: string | null; dob: string | null }`) and `extractOcr(image: Uint8Array, ai: Ai): Promise<OcrResult>` — consumed by Task 3's upload handler. The model is invoked through `ai`, so callers inject a fake `ai` in tests.

- [ ] **Step 1: Write the failing parser tests**

```typescript
// api/test/ocr.spec.ts
import { describe, expect, it } from "vitest";
import { extractOcr } from "../src/kyc/ocr";

// A fake AI binding: its run() returns whatever `response` text we give it.
function fakeAi(responseText: string) {
  return { run: async () => ({ response: responseText }) } as unknown as Ai;
}

const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // arbitrary; the fake AI ignores it

describe("extractOcr", () => {
  it("parses a clean JSON model response", async () => {
    const ai = fakeAi(
      '{"firstName":"Jane","lastName":"Doe","nationalIdNumber":"A1234567","dob":"1990-05-01"}'
    );
    const result = await extractOcr(IMAGE, ai);
    expect(result).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      nationalIdNumber: "A1234567",
      dob: "1990-05-01",
    });
  });

  it("extracts the JSON object when the model wraps it in prose", async () => {
    const ai = fakeAi(
      'Sure! Here is the data:\n{"firstName":"John","lastName":"Smith","nationalIdNumber":"B7654321","dob":"1985-12-20"}\nLet me know if you need more.'
    );
    const result = await extractOcr(IMAGE, ai);
    expect(result.firstName).toBe("John");
    expect(result.nationalIdNumber).toBe("B7654321");
  });

  it("returns all-null fields when the response has no parseable JSON", async () => {
    const ai = fakeAi("I cannot read this document.");
    const result = await extractOcr(IMAGE, ai);
    expect(result).toEqual({
      firstName: null,
      lastName: null,
      nationalIdNumber: null,
      dob: null,
    });
  });

  it("fills missing keys with null", async () => {
    const ai = fakeAi('{"firstName":"Jane"}');
    const result = await extractOcr(IMAGE, ai);
    expect(result).toEqual({
      firstName: "Jane",
      lastName: null,
      nationalIdNumber: null,
      dob: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- ocr.spec.ts`
Expected: FAIL — `Cannot find module '../src/kyc/ocr'`.

- [ ] **Step 3: Implement `api/src/kyc/ocr.ts`**

```typescript
export type OcrResult = {
  firstName: string | null;
  lastName: string | null;
  nationalIdNumber: string | null;
  dob: string | null;
};

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const PROMPT =
  "You are an OCR engine for identity documents. Extract these fields from the ID " +
  "image and reply with ONLY a JSON object, no prose: " +
  '{"firstName": string, "lastName": string, "nationalIdNumber": string, "dob": "YYYY-MM-DD"}. ' +
  "Use null for any field you cannot read.";

// Pull the first balanced {...} block out of arbitrary model text, then JSON.parse it.
function parseModelJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function extractOcr(image: Uint8Array, ai: Ai): Promise<OcrResult> {
  const response = (await ai.run(VISION_MODEL, {
    image: Array.from(image),
    prompt: PROMPT,
    max_tokens: 256,
  } as never)) as { response?: string };

  const parsed = parseModelJson(response.response ?? "");
  if (!parsed) {
    return { firstName: null, lastName: null, nationalIdNumber: null, dob: null };
  }

  return {
    firstName: asStringOrNull(parsed.firstName),
    lastName: asStringOrNull(parsed.lastName),
    nationalIdNumber: asStringOrNull(parsed.nationalIdNumber),
    dob: asStringOrNull(parsed.dob),
  };
}
```

> **Note on the live model call (the one line tests cannot cover):** `ai.run(VISION_MODEL, { image, prompt, max_tokens })` is the documented shape for `@cf/meta/llama-3.2-11b-vision-instruct` (image as an array of 0–255 byte integers, instruct-style `response` text out). Task 5's smoke test is what confirms it against the real model. If the smoke test returns a non-200 or an unexpected response shape, use the `mcp__plugin_cloudflare_cloudflare-docs__search_cloudflare_documentation` tool for "llama-3.2-11b-vision-instruct input schema" and adjust ONLY the `ai.run(...)` argument object — the parser and `OcrResult` contract stay fixed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api -- ocr.spec.ts`
Expected: PASS — all 4 tests in `ocr.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add api/src/kyc/ocr.ts api/test/ocr.spec.ts
git commit -m "feat: add Workers AI vision OCR extractor"
```

---

## Task 3: `POST /api/kyc/upload`

**Files:**
- Create: `api/src/routes/kyc.ts`
- Modify: `api/src/index.ts`
- Test: `api/test/kyc.spec.ts`

**Interfaces:**
- Consumes: `requireAuth` (`api/src/middleware/requireAuth.ts`), `extractOcr` (Task 2), `Bindings`/`Variables` (`api/src/types.ts`).
- Produces: `kyc` Hono sub-app exported from `api/src/routes/kyc.ts`, mounted at `/api/kyc`; `POST /upload` validates and stores the image in R2 (`kyc/{userId}/{uuid}`), runs OCR, writes the KV draft `kyc:draft:{userId}`, and returns `{ suggestions, r2Key }` — Task 4 adds `/confirm` to this same file.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/kyc.spec.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

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

// Fake AI: deterministic OCR result regardless of image bytes.
const fakeAiEnv = () => ({
  ...env,
  AI: {
    run: async () => ({
      response: '{"firstName":"Jane","lastName":"Doe","nationalIdNumber":"A1234567","dob":"1990-05-01"}',
    }),
  },
});

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
      fakeAiEnv()
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ suggestions: Record<string, string>; r2Key: string }>();
    expect(body.suggestions.firstName).toBe("Jane");
    expect(body.suggestions.nationalIdNumber).toBe("A1234567");
    expect(body.r2Key).toBe(`kyc/${userId}/${body.r2Key.split("/")[2]}`);

    // Image is in R2
    const object = await env.KYC_BUCKET.get(body.r2Key);
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

    const res = await app.request(
      "/api/kyc/upload",
      { method: "POST", headers, body: fd },
      fakeAiEnv()
    );
    expect(res.status).toBe(415);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/kyc/upload", { method: "POST", body: uploadForm() }, fakeAiEnv());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- kyc.spec.ts`
Expected: FAIL — 404 (no `/api/kyc/upload` route registered yet).

- [ ] **Step 3: Implement `api/src/routes/kyc.ts`**

```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { extractOcr } from "../kyc/ocr";
import type { Bindings, Variables } from "../types";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const DRAFT_TTL_SECONDS = 3600;

const kyc = new Hono<{ Bindings: Bindings; Variables: Variables }>();

kyc.post("/upload", requireAuth, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return c.json({ error: "Missing file" }, 400);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: "Unsupported file type; use image/jpeg or image/png" }, 415);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large; max 5 MB" }, 400);
  }

  const userId = c.var.userId;
  const r2Key = `kyc/${userId}/${crypto.randomUUID()}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  await c.env.KYC_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  let suggestions;
  try {
    suggestions = await extractOcr(bytes, c.env.AI);
  } catch {
    return c.json({ error: "OCR processing failed" }, 502);
  }

  await c.env.LOAN_CACHE.put(
    `kyc:draft:${userId}`,
    JSON.stringify({ r2Key, ocr: suggestions }),
    { expirationTtl: DRAFT_TTL_SECONDS }
  );

  return c.json({ suggestions, r2Key });
});

export default kyc;
```

- [ ] **Step 4: Mount the kyc sub-app in `api/src/index.ts`**

```typescript
import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import kyc from "./routes/kyc";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/kyc", kyc);

export default app;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix api -- kyc.spec.ts`
Expected: PASS — all 3 upload tests, plus the full existing suite when you run `npm test --prefix api`.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/kyc.ts api/src/index.ts api/test/kyc.spec.ts
git commit -m "feat: add POST /api/kyc/upload with R2 storage and OCR"
```

---

## Task 4: `POST /api/kyc/confirm`

**Files:**
- Modify: `api/src/routes/kyc.ts`
- Modify: `api/test/kyc.spec.ts`

**Interfaces:**
- Consumes: `createProfile` (Task 1, extended), the KV draft written by `/upload` (Task 3), `requireAuth`, `Bindings`/`Variables`.
- Produces: `POST /api/kyc/confirm` — reads the draft, calls `createProfile` to persist the encrypted profile (PII + OCR JSON) plus the R2 pointer, deletes the draft, and returns `{ userId, kycStatus: "pending" }`.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/kyc.spec.ts — add to the existing file
describe("POST /api/kyc/confirm", () => {
  async function uploadFor(userId: string): Promise<void> {
    const headers = await authHeaderFor(userId);
    await app.request(
      "/api/kyc/upload",
      { method: "POST", headers, body: uploadForm() },
      fakeAiEnv()
    );
  }

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
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Doe",
          nationalIdNumber: "A1234567",
          phone: "+15551234567",
          address: "123 Main St",
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json<{ userId: string; kycStatus: string }>();
    expect(body.kycStatus).toBe("pending");

    // Profile row exists, PII is ciphertext, kyc_status defaulted to pending
    const raw = await env.DB.prepare(
      "SELECT first_name, kyc_status, kyc_document_r2_key FROM profiles WHERE user_id = ?"
    )
      .bind(userId)
      .first<{ first_name: string; kyc_status: string; kyc_document_r2_key: string }>();
    expect(raw?.first_name).not.toBe("Jane");
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
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Doe",
          nationalIdNumber: "A1234567",
          phone: "+15551234567",
          address: "123 Main St",
        }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when a profile already exists", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "kyc-dup@example.com");
    const body = {
      firstName: "Jane",
      lastName: "Doe",
      nationalIdNumber: "A1234567",
      phone: "+15551234567",
      address: "123 Main St",
    };

    await uploadFor(userId);
    const headers = await authHeaderFor(userId);
    await app.request(
      "/api/kyc/confirm",
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      env
    );

    // Second attempt: re-upload to get a fresh draft, then confirm again
    await uploadFor(userId);
    const second = await app.request(
      "/api/kyc/confirm",
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      env
    );
    expect(second.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- kyc.spec.ts`
Expected: FAIL — 404 (no `/confirm` route registered yet).

- [ ] **Step 3: Add the `/confirm` route to `api/src/routes/kyc.ts`**

```typescript
// add this import at the top of api/src/routes/kyc.ts
import { createProfile } from "../profiles";

// add below the /upload handler, still inside the same file
kyc.post("/confirm", requireAuth, async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{
    firstName: string;
    lastName: string;
    nationalIdNumber: string;
    phone: string;
    address: string;
  }>();

  const draftRaw = await c.env.LOAN_CACHE.get(`kyc:draft:${userId}`);
  if (!draftRaw) {
    return c.json({ error: "No pending KYC upload" }, 400);
  }
  const draft = JSON.parse(draftRaw) as { r2Key: string; ocr: unknown };

  const existing = await c.env.DB.prepare("SELECT user_id FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first();
  if (existing) {
    return c.json({ error: "Profile already exists" }, 409);
  }

  await createProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
    userId,
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    address: body.address,
    nationalIdNumber: body.nationalIdNumber,
    kycDocumentR2Key: draft.r2Key,
    ocrExtractedData: JSON.stringify(draft.ocr),
  });

  await c.env.LOAN_CACHE.delete(`kyc:draft:${userId}`);

  return c.json({ userId, kycStatus: "pending" }, 201);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — the three new confirm tests, the upload tests, and the full existing suite.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/kyc.ts api/test/kyc.spec.ts
git commit -m "feat: add POST /api/kyc/confirm to create encrypted profile"
```

---

## Task 5: Wrangler Dev Smoke Test (Real Vision OCR)

**Files:**
- Modify: none (verification-only task)

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus `auth-and-sessions`'s register/login.
- Produces: confirmation that `POST /api/kyc/upload` works against the **real** `@cf/meta/llama-3.2-11b-vision-instruct` model with real local R2/KV/D1 — the proof that the OCR call shape in `ocr.ts` is correct against the live model.

> Note: `wrangler dev --local` runs the worker locally but Workers AI inference is proxied to Cloudflare's real edge (AI has no local simulator) and consumes neurons. This is expected and is the point of the smoke test.

- [ ] **Step 1: Provide a real ID-like test image**

Use any JPEG/PNG photo of a document you have rights to (a sample/specimen ID is ideal). Save it as `/tmp/kyc-test-id.png` (or `.jpg`). The model just needs a real image; exact extraction accuracy is not asserted.

- [ ] **Step 2: Start the dev server**

Run: `npx wrangler dev --local`
Expected: `Ready on http://localhost:<port>` (note the port), no binding errors. `.dev.vars` (root) supplies `JWT_SECRET`, `TURNSTILE_SECRET`, `PII_ENCRYPTION_KEY`.

- [ ] **Step 3: Register and log in a borrower, capture the token**

```bash
PORT=<port from step 2>
curl -s -X POST http://localhost:$PORT/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"kyc-smoke@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'

TOKEN=$(curl -s -X POST http://localhost:$PORT/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kyc-smoke@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "token length: ${#TOKEN}"
```
Expected: a non-empty token length. (Local `.dev.vars` `TURNSTILE_SECRET` is the always-pass test key, so the dummy token passes.)

- [ ] **Step 4: Upload the ID image and inspect the OCR suggestions**

```bash
curl -s -X POST http://localhost:$PORT/api/kyc/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/kyc-test-id.png;type=image/png"
```
Expected: HTTP 200 with a JSON body `{"suggestions":{"firstName":...,"lastName":...,"nationalIdNumber":...,"dob":...},"r2Key":"kyc/<uuid>/<uuid>"}`. The field values may be partly null depending on the image — what matters is the **shape** (a `suggestions` object with the four keys and a `kyc/.../...` `r2Key`) and a 200 status, proving the real model call in `ocr.ts` is well-formed.

- [ ] **Step 5: Confirm and verify the profile is created**

```bash
curl -s -X POST http://localhost:$PORT/api/kyc/confirm \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"firstName":"Jane","lastName":"Doe","nationalIdNumber":"A1234567","phone":"+15551234567","address":"123 Main St"}'
```
Expected: HTTP 201, body `{"userId":"<uuid>","kycStatus":"pending"}`.

- [ ] **Step 6: Confirm ciphertext-at-rest in local D1**

```bash
npx wrangler d1 execute microloans_db --local \
  --command="SELECT first_name, ocr_extracted_data, kyc_status FROM profiles WHERE kyc_status='pending' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `first_name` and `ocr_extracted_data` are `iv:ciphertext` base64 blobs (never `Jane`), `kyc_status` is `pending`.

- [ ] **Step 7: Stop the dev server**

Press `Ctrl+C` in the `wrangler dev` terminal.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-06-25-kyc-ocr-pipeline.md
git commit -m "docs: mark kyc-ocr-pipeline plan verified end-to-end via wrangler dev"
```

---

## Self-Review Notes

- **Spec coverage:** Tasks 1–5 cover the design spec in full — two-step upload/confirm (Tasks 3, 4), multipart upload + R2 + KV draft (Task 3), `extractOcr` seam with fake-AI tests (Task 2) and real-AI smoke test (Task 5), encrypted `ocr_extracted_data` + R2 pointer persistence (Task 1), `requireAuth`-only (no Turnstile), and the deferred officer-review boundary (untouched). DOB is carried only inside the encrypted `ocr_extracted_data` JSON and the upload response — no schema migration, per the spec.
- **Placeholder scan:** no TBD/TODO markers; every code step has literal file contents and exact `npm`/`curl`/`wrangler` commands with expected output. The single doc-dependent line (`ai.run` argument shape) is explicitly scoped, with the exact tool to confirm it and the assurance that the parser/contract stay fixed.
- **Type consistency:** `ProfileInput`/`ProfileRecord` gain `kycDocumentR2Key`/`ocrExtractedData` in Task 1 and are consumed with those exact names in Task 4's `createProfile` call. `OcrResult`'s four fields (`firstName`, `lastName`, `nationalIdNumber`, `dob`) are produced in Task 2 and surfaced verbatim as `suggestions` in Task 3 and stored as `draft.ocr` consumed in Task 4. KV key `kyc:draft:{userId}`, R2 key `kyc/{userId}/{uuid}`, and the `@cf/meta/llama-3.2-11b-vision-instruct` model id are identical across the Global Constraints and every task that references them.
```
