# Didit Verification Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homegrown KYC upload/OCR system with Didit's third-party identity verification via a signed webhook endpoint.

**Architecture:** Delete `/api/kyc/upload` and `/api/kyc/confirm` (plus Gemini OCR module). Add `POST /api/webhooks/didit` that verifies an HMAC-SHA256 signature, checks timestamp freshness, routes events, and updates the `profiles` table idempotently. The Didit session is started by the frontend using Didit's SDK with `vendor_data = userId`; results arrive via webhook.

**Tech Stack:** Hono + Cloudflare Workers D1/KV, `crypto.subtle` for HMAC-SHA256, `@cloudflare/vitest-pool-workers` for tests.

## Global Constraints

- Never use `jest.spyOn(globalThis, 'fetch')` in Workers tests — use `fetchMock` from `cloudflare:test` instead.
- Constant-time comparison required for HMAC signature verification (timing-attack prevention).
- Return 2xx from the webhook handler before doing any heavy work.
- Idempotency key: `event_id` field from the Didit envelope — deduplicate via KV (`LOAN_CACHE`) with 24h TTL.
- Signature algorithm: X-Signature-V2 (HMAC-SHA256 over sorted canonical JSON).
- Timestamp window: ≤ 300 seconds from `X-Timestamp` header.
- Tests run inside miniflare (real Workers runtime); all bindings must be declared in `vitest.config.ts` `miniflare.bindings`.

---

## File Map


| Action | Path                             |
| ------ | -------------------------------- |
| CREATE | `api/migrations/0004_didit.sql`  |
| MODIFY | `api/src/profiles.ts`            |
| DELETE | `api/src/kyc/ocr.ts`             |
| DELETE | `api/src/routes/kyc.ts`          |
| MODIFY | `api/src/index.ts`               |
| MODIFY | `api/src/types.ts`               |
| MODIFY | `wrangler.toml`                  |
| CREATE | `api/src/routes/webhooks.ts`     |
| MODIFY | `api/vitest.config.ts`           |
| DELETE | `api/test/kyc.spec.ts`           |
| DELETE | `api/test/ocr.spec.ts`           |
| MODIFY | `api/test/profiles.spec.ts`      |
| CREATE | `api/test/didit-webhook.spec.ts` |


---

## Task 1: DB Migration — Rebuild `profiles` for Didit

**Files:**

- Create: `api/migrations/0004_didit.sql`

**Interfaces:**

- Produces: `profiles` table with nullable PII columns, no `kyc_document_r2_key`/`ocr_extracted_data`, new `didit_session_id`, expanded `kyc_status` CHECK.

- [ ] **Step 1: Write the migration**

Create `api/migrations/0004_didit.sql`:

```sql
-- Rebuild profiles: drop OCR columns, make PII nullable, add Didit fields, expand kyc_status.
-- SQLite cannot ALTER CHECK constraints or drop NOT NULL in-place; recreate the table.
CREATE TABLE profiles_v2 (
    user_id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    address TEXT,
    national_id_number TEXT,
    kyc_status TEXT CHECK(kyc_status IN (
        'pending', 'approved', 'declined',
        'in_review', 'in_progress', 'abandoned',
        'expired', 'resubmitted'
    )) DEFAULT 'pending',
    didit_session_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO profiles_v2 (user_id, first_name, last_name, phone, address,
                          national_id_number, kyc_status, created_at)
SELECT user_id, first_name, last_name, phone, address,
       national_id_number,
       CASE kyc_status
           WHEN 'rejected' THEN 'declined'
           ELSE kyc_status
       END,
       created_at
FROM profiles;

DROP TABLE profiles;
ALTER TABLE profiles_v2 RENAME TO profiles;
```

- [ ] **Step 2: Verify migration syntax (dry-run)**

```bash
cd /home/yasser/Desktop/Big-5/microloans
wrangler d1 execute microloans_db --local --file=api/migrations/0004_didit.sql
```

Expected: no errors; `profiles` table recreated.

- [ ] **Step 3: Commit**

```bash
git add api/migrations/0004_didit.sql
git commit -m "feat: migrate profiles table for Didit (nullable PII, didit_session_id, expanded kyc_status)"
```

---

## Task 2: Remove Old KYC Code + Update Core Files

**Files:**

- Delete: `api/src/kyc/ocr.ts`
- Delete: `api/src/routes/kyc.ts`
- Delete: `api/test/kyc.spec.ts`
- Delete: `api/test/ocr.spec.ts`
- Modify: `api/src/index.ts`
- Modify: `api/src/types.ts`
- Modify: `wrangler.toml`

**Interfaces:**

- Consumes: nothing (deletions only + config changes)
- Produces: `Bindings` type without `KYC_BUCKET`/`GEMINI_API_KEY`; gains `DIDIT_WEBHOOK_SECRET`. Hono app no longer mounts `/api/kyc`.

- [ ] **Step 1: Delete KYC source files**

```bash
rm /home/yasser/Desktop/Big-5/microloans/api/src/kyc/ocr.ts
rm /home/yasser/Desktop/Big-5/microloans/api/src/routes/kyc.ts
rm /home/yasser/Desktop/Big-5/microloans/api/test/kyc.spec.ts
rm /home/yasser/Desktop/Big-5/microloans/api/test/ocr.spec.ts
```

Also remove the now-empty `kyc/` directory:

```bash
rmdir /home/yasser/Desktop/Big-5/microloans/api/src/kyc
```

- [ ] **Step 2: Update `api/src/types.ts`**

Replace the entire file:

```ts
export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  PII_ENCRYPTION_KEY: string;
  DIDIT_WEBHOOK_SECRET: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
```

- [ ] **Step 3: Update `api/src/index.ts`** — remove kyc import/route

Replace the entire file:

```ts
import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import plaid from "./routes/plaid";
import profile from "./routes/profile";
import payments from "./routes/payments";
import config from "./routes/config";
import docs from "./routes/docs";
import webhooks from "./routes/webhooks";
import type { Bindings, Variables } from "./types";
import openApiSpec from "../openapi.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/plaid", plaid);
app.route("/api/profile", profile);
app.route("/api/payments", payments);
app.route("/api/config", config);
app.route("/api/webhooks", webhooks);
app.route("/docs", docs);
app.get("/", (c) => c.redirect("/docs"));
app.get("/openapi.json", (c) => c.json(openApiSpec));
export default app;
```

- [ ] **Step 4: Update `wrangler.toml`** — remove KYC_BUCKET r2 binding

Remove the `[[r2_buckets]]` block entirely (the `KYC_BUCKET` binding). The file currently ends with:

```toml
[[r2_buckets]]
binding = "KYC_BUCKET"
bucket_name = "microloans-kyc"
```

Delete those 3 lines.

- [ ] **Step 5: Run tests to confirm nothing else imports KYC**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run
```

Expected: all remaining tests pass; `kyc.spec.ts` and `ocr.spec.ts` no longer appear.  
If TypeScript errors appear about `KYC_BUCKET` or `GEMINI_API_KEY` in other files, fix them before continuing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove homegrown KYC (ocr.ts, routes/kyc.ts, r2 bucket, Gemini secret)"
```

---

## Task 3: Update `profiles.ts` for Didit Schema

**Files:**

- Modify: `api/src/profiles.ts`
- Modify: `api/test/profiles.spec.ts`

**Interfaces:**

- Produces:
  - `ProfileInput`: `{ userId, firstName?, lastName?, phone?, address?, nationalIdNumber?, diditSessionId? }`
  - `ProfileRecord`: same fields + `kycStatus`, `diditSessionId`
  - `createProfile(db, encKey, input): Promise<void>` — inserts a profile row; all PII fields optional
  - `getProfile(db, encKey, userId): Promise<ProfileRecord | null>` — decrypts available PII
  - `upsertVerificationStatus(db, userId, kycStatus, diditSessionId): Promise<void>` — idempotent status update

- [ ] **Step 1: Rewrite `api/src/profiles.ts`**

```ts
import { encryptField, decryptField } from "./crypto";

export type ProfileInput = {
  userId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  nationalIdNumber?: string;
  diditSessionId?: string;
};

export type ProfileRecord = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  nationalIdNumber: string | null;
  kycStatus: "pending" | "approved" | "declined" | "in_review" | "in_progress" | "abandoned" | "expired" | "resubmitted";
  diditSessionId: string | null;
};

async function encryptOrNull(value: string | undefined, key: string): Promise<string | null> {
  return value != null ? encryptField(value, key) : null;
}

async function decryptOrNull(value: string | null, key: string): Promise<string | null> {
  return value != null ? decryptField(value, key) : null;
}

export async function createProfile(
  db: D1Database,
  encryptionKey: string,
  input: ProfileInput
): Promise<void> {
  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    encryptOrNull(input.firstName, encryptionKey),
    encryptOrNull(input.lastName, encryptionKey),
    encryptOrNull(input.phone, encryptionKey),
    encryptOrNull(input.address, encryptionKey),
    encryptOrNull(input.nationalIdNumber, encryptionKey),
  ]);

  await db
    .prepare(
      `INSERT INTO profiles
         (user_id, first_name, last_name, phone, address, national_id_number, didit_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(input.userId, firstName, lastName, phone, address, nationalIdNumber, input.diditSessionId ?? null)
    .run();
}

export async function upsertVerificationStatus(
  db: D1Database,
  userId: string,
  kycStatus: ProfileRecord["kycStatus"],
  diditSessionId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, kyc_status, didit_session_id)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         kyc_status = excluded.kyc_status,
         didit_session_id = excluded.didit_session_id`
    )
    .bind(userId, kycStatus, diditSessionId)
    .run();
}

export async function getProfile(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<ProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, first_name, last_name, phone, address, national_id_number,
              kyc_status, didit_session_id
       FROM profiles WHERE user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      address: string | null;
      national_id_number: string | null;
      kyc_status: ProfileRecord["kycStatus"];
      didit_session_id: string | null;
    }>();

  if (!row) return null;

  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    decryptOrNull(row.first_name, encryptionKey),
    decryptOrNull(row.last_name, encryptionKey),
    decryptOrNull(row.phone, encryptionKey),
    decryptOrNull(row.address, encryptionKey),
    decryptOrNull(row.national_id_number, encryptionKey),
  ]);

  return {
    userId: row.user_id,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
    kycStatus: row.kyc_status,
    diditSessionId: row.didit_session_id,
  };
}
```

- [ ] **Step 2: Rewrite `api/test/profiles.spec.ts`**

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createProfile, getProfile, upsertVerificationStatus } from "../src/profiles";

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

describe("createProfile / getProfile", () => {
  it("stores PII as ciphertext and returns decrypted plaintext on read", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "profile-test@example.com");

    await createProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId,
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15551234567",
      address: "123 Main St",
      nationalIdNumber: "A1234567",
    });

    const raw = await env.DB.prepare(
      "SELECT first_name, phone FROM profiles WHERE user_id = ?"
    ).bind(userId).first<{ first_name: string; phone: string }>();
    expect(raw?.first_name).not.toBe("Jane");
    expect(raw?.phone).not.toBe("+15551234567");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.firstName).toBe("Jane");
    expect(profile?.phone).toBe("+15551234567");
    expect(profile?.kycStatus).toBe("pending");
    expect(profile?.diditSessionId).toBeNull();
  });

  it("returns null for a user with no profile", async () => {
    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, crypto.randomUUID());
    expect(profile).toBeNull();
  });
});

describe("upsertVerificationStatus", () => {
  it("creates a profile row if none exists", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "upsert-new@example.com");

    await upsertVerificationStatus(env.DB, userId, "approved", "sess-123");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.kycStatus).toBe("approved");
    expect(profile?.diditSessionId).toBe("sess-123");
  });

  it("updates status on existing profile without overwriting PII", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "upsert-existing@example.com");

    await createProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId, firstName: "Jane", lastName: "Doe",
      phone: "+15551234567", address: "123 Main", nationalIdNumber: "A1234567",
    });

    await upsertVerificationStatus(env.DB, userId, "declined", "sess-456");

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.kycStatus).toBe("declined");
    expect(profile?.diditSessionId).toBe("sess-456");
    // PII untouched — first_name should still decrypt correctly
    expect(profile?.firstName).toBe("Jane");
  });
});
```

- [ ] **Step 3: Run profiles tests**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/profiles.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/src/profiles.ts api/test/profiles.spec.ts
git commit -m "feat: update profiles.ts for Didit (nullable PII, upsertVerificationStatus)"
```

---

## Task 4: Implement Didit Webhook Endpoint + Tests

**Files:**

- Create: `api/src/routes/webhooks.ts`
- Create: `api/test/didit-webhook.spec.ts`
- Modify: `api/vitest.config.ts` — add `DIDIT_WEBHOOK_SECRET` binding

**Interfaces:**

- Consumes:
  - `upsertVerificationStatus(db, userId, kycStatus, diditSessionId)` from `../profiles`
  - `DIDIT_WEBHOOK_SECRET` from `c.env`
  - `LOAN_CACHE` KV for idempotency keys
- Produces: `POST /api/webhooks/didit` → 200 on success, 400 on bad signature/stale timestamp, 409 on duplicate event

- [ ] **Step 1: Add `DIDIT_WEBHOOK_SECRET` to `api/vitest.config.ts` miniflare bindings**

In `api/vitest.config.ts`, add to the `miniflare.bindings` object:

```ts
DIDIT_WEBHOOK_SECRET: "test-webhook-secret",
```

The existing bindings block already has `TEST_MIGRATIONS` and `TURNSTILE_SECRET`. Add the new line after `TURNSTILE_SECRET`:

```ts
bindings: {
  TEST_MIGRATIONS: migrations,
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  DIDIT_WEBHOOK_SECRET: "test-webhook-secret",
},
```

- [ ] **Step 2: Write the failing test**

Create `api/test/didit-webhook.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";

// Canonical JSON: sort object keys recursively (matches Didit X-Signature-V2)
function canonicalize(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

async function postWebhook(body: object, overrides: { sig?: string; timestamp?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ts = overrides.timestamp ?? now;
  const canonical = canonicalize(body);
  const sig = overrides.sig ?? await sign(canonical, "test-webhook-secret");

  return app.request("/api/webhooks/didit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-V2": sig,
      "X-Timestamp": String(ts),
    },
    body: JSON.stringify(body),
  }, env);
}

function makeEvent(userId: string, status: string, webhookType = "status.updated") {
  return {
    event_id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    status,
    webhook_type: webhookType,
    created_at: Math.floor(Date.now() / 1000),
    timestamp: Math.floor(Date.now() / 1000),
    application_id: "app-id",
    workflow_id: "wf-id",
    workflow_version: 1,
    vendor_data: userId,
  };
}

describe("POST /api/webhooks/didit", () => {
  it("returns 400 when signature is wrong", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "bad-sig@example.com");
    const res = await postWebhook(makeEvent(userId, "Approved"), { sig: "deadbeef" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when timestamp is stale (> 300s)", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "stale-ts@example.com");
    const staleTs = Math.floor(Date.now() / 1000) - 301;
    const res = await postWebhook(makeEvent(userId, "Approved"), { timestamp: staleTs });
    expect(res.status).toBe(400);
  });

  it("sets kycStatus=approved on Approved event", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "approved@example.com");
    const event = makeEvent(userId, "Approved");

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT kyc_status, didit_session_id FROM profiles WHERE user_id = ?")
      .bind(userId).first<{ kyc_status: string; didit_session_id: string }>();
    expect(row?.kyc_status).toBe("approved");
    expect(row?.didit_session_id).toBe(event.session_id);
  });

  it("sets kycStatus=declined on Declined event", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "declined@example.com");

    const res = await postWebhook(makeEvent(userId, "Declined"));
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
      .bind(userId).first<{ kyc_status: string }>();
    expect(row?.kyc_status).toBe("declined");
  });

  it("sets kycStatus=in_review on In Review event", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "in-review@example.com");

    const res = await postWebhook(makeEvent(userId, "In Review"));
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
      .bind(userId).first<{ kyc_status: string }>();
    expect(row?.kyc_status).toBe("in_review");
  });

  it("deduplicates events with the same event_id", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "dedup@example.com");
    const event = makeEvent(userId, "In Progress");

    const first = await postWebhook(event);
    expect(first.status).toBe(200);

    const second = await postWebhook(event); // same event_id
    expect(second.status).toBe(200); // still 2xx, just skipped
  });

  it("ignores non-status.updated webhook types gracefully", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "other-type@example.com");

    const res = await postWebhook(makeEvent(userId, "Approved", "data.updated"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/didit-webhook.spec.ts
```

Expected: FAIL — `Cannot find module '../src/routes/webhooks'`.

- [ ] **Step 4: Implement `api/src/routes/webhooks.ts`**

```ts
import { Hono } from "hono";
import { upsertVerificationStatus } from "../profiles";
import type { Bindings, Variables } from "../types";
import type { ProfileRecord } from "../profiles";

type DiditStatus = string;

// Recursively sort object keys for canonical JSON (X-Signature-V2)
function canonicalize(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}

async function verifySignature(secret: string, payload: string, sig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedHex.length !== sig.length) return false;
  // ponytail: constant-time compare to prevent timing attacks
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

function toKycStatus(diditStatus: DiditStatus): ProfileRecord["kycStatus"] | null {
  switch (diditStatus) {
    case "Approved":      return "approved";
    case "Declined":      return "declined";
    case "In Review":     return "in_review";
    case "In Progress":   return "in_progress";
    case "Not Started":   return "pending";
    case "Abandoned":     return "abandoned";
    case "Expired":
    case "KYC Expired":   return "expired";
    case "Resubmitted":   return "resubmitted";
    default:              return null;
  }
}

const webhooks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

webhooks.post("/didit", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("X-Signature-V2") ?? "";
  const tsHeader = c.req.header("X-Timestamp") ?? "0";
  const ts = parseInt(tsHeader, 10);
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - ts) > 300) {
    return c.json({ error: "Stale timestamp" }, 400);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const canonical = canonicalize(parsed);
  const valid = await verifySignature(c.env.DIDIT_WEBHOOK_SECRET, canonical, sig);
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const eventId = parsed.event_id as string | undefined;
  const sessionId = parsed.session_id as string | undefined;
  const status = parsed.status as DiditStatus | undefined;
  const webhookType = parsed.webhook_type as string | undefined;
  const userId = parsed.vendor_data as string | undefined;

  // Idempotency: skip already-processed events
  if (eventId) {
    const idempotencyKey = `didit:event:${eventId}`;
    const seen = await c.env.LOAN_CACHE.get(idempotencyKey);
    if (seen) {
      return c.json({ ok: true, skipped: true });
    }
    // Mark as processed (24h TTL — covers Didit's 2-retry window comfortably)
    await c.env.LOAN_CACHE.put(idempotencyKey, "1", { expirationTtl: 86400 });
  }

  // Only act on status.updated for identity sessions with a known vendor user
  if (webhookType === "status.updated" && userId && sessionId && status) {
    const kycStatus = toKycStatus(status);
    if (kycStatus) {
      await upsertVerificationStatus(c.env.DB, userId, kycStatus, sessionId);
    }
  }

  return c.json({ ok: true });
});

export default webhooks;
```

- [ ] **Step 5: Run the tests**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/didit-webhook.spec.ts
```

Expected: all 6 tests pass.

- [ ] **Step 6: Run full test suite**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run
```

Expected: all tests pass; zero references to `kyc`, `ocr`, `KYC_BUCKET`, or `GEMINI_API_KEY`.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/webhooks.ts api/test/didit-webhook.spec.ts api/vitest.config.ts
git commit -m "feat: add Didit webhook endpoint with HMAC-SHA256 verification and idempotent status updates"
```

---

## Post-Implementation Checklist

- [ ] Register `DIDIT_WEBHOOK_SECRET` in `.dev.vars` locally:
  ```
  DIDIT_WEBHOOK_SECRET=<value from Didit Business Console>
  ```
- [ ] Register secret in Cloudflare production:
  ```bash
  wrangler secret put DIDIT_WEBHOOK_SECRET
  ```
- [ ] Apply migration to remote DB:
  ```bash
  wrangler d1 migrations apply microloans_db
  ```
- [ ] In Didit Business Console, create a webhook destination pointing to `https://<your-worker>.workers.dev/api/webhooks/didit` and subscribe to at minimum: `status.updated`, `data.updated`.
- [ ] Set `vendor_data` to the internal `userId` when creating Didit verification sessions on the frontend.
- [ ] Optional: whitelist Didit IP `18.203.201.92` in Cloudflare WAF if behind strict rules.