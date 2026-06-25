# PII Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AES-GCM encrypt the `profiles` table's PII fields (`first_name`, `last_name`, `phone`, `address`, `national_id_number`) in the application layer before they ever reach D1, and decrypt them on read — so a raw D1 dump yields only ciphertext, per CLOUDFLARE_MICROLOAN_PLAN.md §4.C.1.

**Architecture:** `api/src/crypto.ts` holds pure AES-GCM encrypt/decrypt functions (Web Crypto, no bindings) — each call generates a fresh random IV and returns `iv:ciphertext` as one base64-delimited string, so the same plaintext never produces the same ciphertext twice. `api/src/profiles.ts` is a small data-access module — `createProfile`/`getProfile` — that calls `crypto.ts` to encrypt before `INSERT` and decrypt after `SELECT`. There is no HTTP route in this plan; wiring profiles into an endpoint (with R2 document upload and OCR) is the `kyc-ocr-pipeline` plan's job.

**Tech Stack:** Web Crypto API (`crypto.subtle`, AES-GCM 256), Cloudflare D1, Vitest + `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Builds on the Foundation plan (`docs/superpowers/plans/2026-06-25-foundation-setup.md`) — the `profiles` table (with FK to `users`) already exists via the D1 migration. Do not modify the schema.
- No secrets committed. `PII_ENCRYPTION_KEY` (a base64-encoded 256-bit AES key) is read from `c.env`, supplied locally via the gitignored `api/.dev.vars` file and in production via `wrangler secret put`.
- Encrypted fields per CLOUDFLARE_MICROLOAN_PLAN.md §4.C.1: `first_name`, `last_name`, `phone`, `address`, `national_id_number`. `kyc_status`, `kyc_document_r2_key`, `ocr_extracted_data`, and `created_at` are NOT encrypted (status/pointer/timestamp fields, not PII content).
- **Known limitation, intentionally out of scope:** the D1 schema declares `phone` and `national_id_number` as `UNIQUE`. Because AES-GCM with a random IV produces different ciphertext for the same plaintext on every call, SQLite's `UNIQUE` constraint can no longer detect duplicate phone numbers or national ID numbers once those columns hold ciphertext. Solving this (e.g., via a separate deterministic blind-index column, HMAC-keyed) is a real design decision affecting the schema and is deferred to a future plan — do not silently work around it here.
- AES-GCM IV is 12 bytes (96 bits), generated fresh per `encryptField` call via `crypto.getRandomValues` — never reuse an IV with the same key.

---

## File Structure

```
microloans/
├── api/
│   ├── .dev.vars                  # MODIFIED: add PII_ENCRYPTION_KEY
│   ├── src/
│   │   ├── types.ts               # MODIFIED: Bindings gains PII_ENCRYPTION_KEY
│   │   ├── crypto.ts              # NEW: encryptField, decryptField (AES-GCM)
│   │   └── profiles.ts            # NEW: createProfile, getProfile (D1 + encryption)
│   └── test/
│       ├── crypto.spec.ts         # NEW
│       └── profiles.spec.ts       # NEW
```

- `crypto.ts` stays free of D1/Hono types so it can be unit-tested in isolation and reused by any future module that needs field-level encryption (e.g., a future `kyc-ocr-pipeline` storing OCR-extracted PII).
- `profiles.ts` is the only file that knows both "which fields are PII" and "how the `profiles` table is shaped" — that mapping shouldn't leak into route handlers later.

---

## Task 1: AES-GCM Encrypt/Decrypt Primitives

**Files:**
- Create: `api/src/crypto.ts`
- Test: `api/test/crypto.spec.ts`

**Interfaces:**
- Consumes: nothing (pure Web Crypto).
- Produces: `encryptField(plaintext: string, base64Key: string): Promise<string>` and `decryptField(blob: string, base64Key: string): Promise<string>` — consumed by Task 2's `profiles.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/crypto.spec.ts
import { describe, expect, it } from "vitest";
import { encryptField, decryptField } from "../src/crypto";

function randomBase64Key(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...raw));
}

describe("encryptField / decryptField", () => {
  it("round-trips plaintext through encryption and decryption", async () => {
    const key = randomBase64Key();
    const blob = await encryptField("Jane Doe", key);
    const plaintext = await decryptField(blob, key);

    expect(plaintext).toBe("Jane Doe");
  });

  it("produces different ciphertext for the same plaintext each call", async () => {
    const key = randomBase64Key();
    const blobA = await encryptField("Jane Doe", key);
    const blobB = await encryptField("Jane Doe", key);

    expect(blobA).not.toEqual(blobB);
  });

  it("fails to decrypt with the wrong key", async () => {
    const blob = await encryptField("Jane Doe", randomBase64Key());
    await expect(decryptField(blob, randomBase64Key())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/crypto'`.

- [ ] **Step 3: Implement `api/src/crypto.ts`**

```typescript
const IV_LENGTH_BYTES = 12;

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToUint8Array(base64Key);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptField(plaintext: string, base64Key: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${arrayBufferToBase64(iv)}:${arrayBufferToBase64(ciphertext)}`;
}

export async function decryptField(blob: string, base64Key: string): Promise<string> {
  const [ivB64, ciphertextB64] = blob.split(":");
  const key = await importAesKey(base64Key);
  const iv = base64ToUint8Array(ivB64);
  const ciphertext = base64ToUint8Array(ciphertextB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — all 3 tests in `crypto.spec.ts`, plus the full existing suite.

- [ ] **Step 5: Commit**

```bash
git add api/src/crypto.ts api/test/crypto.spec.ts
git commit -m "feat: add AES-GCM field encryption primitives"
```

---

## Task 2: Profiles Repository with Field-Level Encryption

**Files:**
- Modify: `api/src/types.ts`
- Modify: `api/.dev.vars`
- Create: `api/src/profiles.ts`
- Test: `api/test/profiles.spec.ts`

**Interfaces:**
- Consumes: `encryptField`/`decryptField` (Task 1), `Bindings` (from the `auth-and-sessions` plan's `api/src/types.ts` — if that plan hasn't been executed yet, create `api/src/types.ts` fresh with just `{ DB: D1Database; PII_ENCRYPTION_KEY: string }`).
- Produces: `createProfile(db: D1Database, key: string, input: ProfileInput): Promise<void>` and `getProfile(db: D1Database, key: string, userId: string): Promise<ProfileRecord | null>` from `api/src/profiles.ts` — consumed by the future `kyc-ocr-pipeline` plan's `/api/kyc/upload` endpoint.

- [ ] **Step 1: Add `PII_ENCRYPTION_KEY` to `api/.dev.vars`**

Generate a real random key and append it (do not reuse this exact value anywhere outside local dev):

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
Expected: a base64 string printed to stdout, e.g. `Kj8f3x...==`.

Append to `api/.dev.vars` (creating the file if Task 1 of `auth-and-sessions` hasn't run yet):
```
PII_ENCRYPTION_KEY=<paste the generated base64 string here>
```

- [ ] **Step 2: Ensure `Bindings` in `api/src/types.ts` includes `PII_ENCRYPTION_KEY`**

If `api/src/types.ts` already exists (from the `auth-and-sessions` plan), add the field:

```typescript
export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  KYC_BUCKET: R2Bucket;
  AI: Ai;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  PII_ENCRYPTION_KEY: string;
};
```

If it does not exist yet, create it with just the fields this plan needs:

```typescript
export type Bindings = {
  DB: D1Database;
  PII_ENCRYPTION_KEY: string;
};
```

- [ ] **Step 3: Write the failing test**

```typescript
// api/test/profiles.spec.ts
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
  it("stores PII as ciphertext and returns decrypted plaintext on read", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "profile-test@example.com");

    await createProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      address: "123 Main St",
      nationalIdNumber: "A1234567",
    });

    const raw = await env.DB.prepare("SELECT first_name, phone FROM profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ first_name: string; phone: string }>();
    expect(raw?.first_name).not.toBe("Jane");
    expect(raw?.phone).not.toBe("+15551234567");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile).toEqual({
      userId,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      address: "123 Main St",
      nationalIdNumber: "A1234567",
      kycStatus: "pending",
    });
  });

  it("returns null for a user with no profile", async () => {
    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, crypto.randomUUID());
    expect(profile).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/profiles'`.

- [ ] **Step 5: Implement `api/src/profiles.ts`**

```typescript
import { encryptField, decryptField } from "./crypto";

export type ProfileInput = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
};

export type ProfileRecord = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
  kycStatus: "pending" | "approved" | "rejected";
};

export async function createProfile(
  db: D1Database,
  encryptionKey: string,
  input: ProfileInput
): Promise<void> {
  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    encryptField(input.firstName, encryptionKey),
    encryptField(input.lastName, encryptionKey),
    encryptField(input.phone, encryptionKey),
    encryptField(input.address, encryptionKey),
    encryptField(input.nationalIdNumber, encryptionKey),
  ]);

  await db
    .prepare(
      `INSERT INTO profiles (user_id, first_name, last_name, phone, address, national_id_number)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(input.userId, firstName, lastName, phone, address, nationalIdNumber)
    .run();
}

export async function getProfile(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<ProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, first_name, last_name, phone, address, national_id_number, kyc_status
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
    }>();

  if (!row) {
    return null;
  }

  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    decryptField(row.first_name, encryptionKey),
    decryptField(row.last_name, encryptionKey),
    decryptField(row.phone, encryptionKey),
    decryptField(row.address, encryptionKey),
    decryptField(row.national_id_number, encryptionKey),
  ]);

  return {
    userId: row.user_id,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
    kycStatus: row.kyc_status,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both tests in `profiles.spec.ts`, plus the full existing suite.

- [ ] **Step 7: Commit**

```bash
git add api/src/types.ts api/src/profiles.ts api/test/profiles.spec.ts
git commit -m "feat: add profiles repository with AES-GCM field encryption"
```

(`.dev.vars` is gitignored — confirm with `git status` that it does not appear in the diff before continuing.)

---

## Task 3: Verify Ciphertext-at-Rest via Local D1

**Files:**
- Modify: none (verification-only task)

**Interfaces:**
- Consumes: `createProfile` (Task 2).
- Produces: direct confirmation, by querying the real local D1 database (not the test sandbox), that `profiles` rows contain ciphertext — the concrete proof behind CLOUDFLARE_MICROLOAN_PLAN.md §4.C.1's claim that "a D1 leak would yield only ciphertext."

- [ ] **Step 1: Insert a test user and profile via a throwaway Node script**

Run:
```bash
cat <<'EOF' > /tmp/seed-profile.sql
INSERT INTO users (id, email, password_hash, role) VALUES ('verify-pii-user', 'verify-pii@example.com', 'unused', 'borrower');
EOF
npx wrangler d1 execute microloans_db --local --file=/tmp/seed-profile.sql
```
Expected: success, no SQL errors.

- [ ] **Step 2: Encrypt a profile for that user using the real local D1 binding**

Run:
```bash
npx wrangler dev --local &
sleep 3
```

Since there is no HTTP route for profile creation yet (that's the `kyc-ocr-pipeline` plan's job), instead run the existing test suite, which already exercises `createProfile` against this same local D1 file via Miniflare:

Run: `npm test --prefix api -- profiles.spec.ts`
Expected: PASS.

Stop the background dev server:
Run: `kill %1`

- [ ] **Step 3: Query the test-created row directly and confirm it is not plaintext**

Run:
```bash
npx wrangler d1 execute microloans_db --local --command="SELECT user_id, first_name, phone FROM profiles WHERE user_id != 'verify-pii-user' LIMIT 1;"
```
Expected: `first_name` and `phone` are unreadable base64-with-colon blobs (e.g. `"k3F9...:Lp2x..."`), never `"Jane"` or `"+15551234567"`.

- [ ] **Step 4: Clean up the throwaway seed user**

Run:
```bash
npx wrangler d1 execute microloans_db --local --command="DELETE FROM users WHERE id = 'verify-pii-user';"
rm /tmp/seed-profile.sql
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-25-pii-encryption.md
git commit -m "docs: mark pii-encryption plan verified via local D1 ciphertext inspection"
```

---

## Self-Review Notes

- **Spec coverage:** Tasks 1–3 cover CLOUDFLARE_MICROLOAN_PLAN.md §4.C.1 in full (AES-GCM encryption of names/address/national ID in the Worker before D1 writes, keys via Workers Secret env vars). The OCR/R2 upload half of KYC (§4.A) is explicitly out of scope — that's the `kyc-ocr-pipeline` plan.
- **Placeholder scan:** no TBD/TODO markers; every step has literal file contents and exact commands. The UNIQUE-constraint-vs-encryption tension is documented as an explicit, named limitation rather than glossed over.
- **Type consistency:** `ProfileInput`/`ProfileRecord` field names (`firstName`, `lastName`, `phone`, `address`, `nationalIdNumber`) are used identically in `profiles.ts` (Task 2) and its test. `Bindings.PII_ENCRYPTION_KEY: string` matches the `encryptionKey: string` parameter type on both `createProfile` and `getProfile`.
