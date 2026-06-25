# Plaid Audit + Scoring & MVP Endpoint Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side Plaid Sandbox bank audit that produces a final risk score (bank safety + internal behavior) hard-gating loan creation, and fill the remaining endpoint gaps so the backend is frontend-MVP-ready.

**Architecture:** A thin `fetch` Plaid client + pure scoring functions feed a new `POST /api/plaid/connect` route that stores an encrypted `plaid_items` row. The existing `POST /api/loans/` is modified to require a connected bank and gate on the blended score. Five read/authorization gaps (`GET /auth/me`, `GET /api/profile`, `GET /api/loans`, `POST /api/loans/:id/reject`, ownership check on `GET /api/loans/:id`) complete the MVP surface.

**Tech Stack:** Hono, Cloudflare D1/KV/R2, Plaid Sandbox REST (`https://sandbox.plaid.com`, no SDK), Web Crypto AES-GCM (`api/src/crypto.ts`), Vitest + `@cloudflare/vitest-pool-workers` (outbound HTTP faked with the pool's undici `fetchMock`).

**Spec:** `docs/superpowers/specs/2026-06-25-plaid-audit-scoring-design.md`

## Global Constraints

- Builds on `main`: `api/src/crypto.ts` (`encryptField(plaintext, base64Key)` / `decryptField(blob, base64Key)`), `api/src/middleware/requireAuth.ts` (sets `c.var.userId`, `c.var.role`), `api/src/middleware/requireRole.ts` (`requireRole(...roles)`), `api/src/profiles.ts` (`getProfile(db, key, userId)`), `api/src/auth/jwt.ts` (`signJwt`/`verifyJwt`), `api/src/types.ts` (`Bindings`/`Variables`). Do not re-create these.
- No secrets committed. `PLAID_CLIENT_ID` / `PLAID_SECRET` come from `c.env`, supplied locally via gitignored `.dev.vars` (already added) and in prod via `wrangler secret put`.
- Plaid base URL is exactly `https://sandbox.plaid.com` (module constant). Sandbox institution id is exactly `ins_109508`, `initial_products: ["transactions"]`.
- `access_token` is AES-GCM encrypted via `encryptField` before any D1 write; never stored plaintext.
- Scoring weights: `finalScore = round(0.6*bankSafety + 0.4*behavior)`. Hard-gate `THRESHOLD = 50`. Sub-scores clamp to `[0,100]`.
- Tests fake outbound HTTP with the pool's undici `fetchMock` from `cloudflare:test` (NEVER a `globalThis.fetch` spy — it corrupts isolated-storage teardown). `vitest.config.ts` already pins `TURNSTILE_SECRET`.
- Test fixtures insert users directly and mint JWTs with `signJwt({ sub, role }, env.JWT_SECRET, 3600)`.

---

## File Structure

```
microloans/
├── api/
│   ├── migrations/
│   │   └── 0002_plaid.sql            # NEW: plaid_items table
│   ├── src/
│   │   ├── types.ts                  # MODIFIED: + PLAID_CLIENT_ID, PLAID_SECRET
│   │   ├── plaid/
│   │   │   ├── client.ts             # NEW: sandbox REST wrapper
│   │   │   ├── scoring.ts            # NEW: pure bankSafetyScore/behaviorScore/finalScore
│   │   │   └── items.ts              # NEW: upsert/get plaid_items (encrypts access_token)
│   │   ├── routes/
│   │   │   ├── plaid.ts              # NEW: POST /connect
│   │   │   ├── auth.ts               # MODIFIED: + GET /me
│   │   │   ├── profile.ts            # NEW: GET /  (my profile + kyc + bank status)
│   │   │   └── loans.ts             # MODIFIED: gate POST /, GET / list, POST /:id/reject, GET /:id authz
│   │   └── index.ts                  # MODIFIED: mount /api/plaid, /api/profile
│   └── test/
│       ├── scoring.spec.ts           # NEW
│       ├── plaid.spec.ts             # NEW
│       ├── profile.spec.ts           # NEW
│       └── loans.spec.ts            # MODIFIED: gate + list + reject + authz
```

---

## Task 1: Plaid config + sandbox REST client

**Files:**
- Modify: `api/src/types.ts`
- Create: `api/src/plaid/client.ts`
- Test: covered indirectly by Task 4 (`plaid.spec.ts`); no standalone test (thin I/O wrapper).

**Interfaces:**
- Consumes: `Bindings` from `api/src/types.ts`.
- Produces: `PlaidAccount` type, and `sandboxCreatePublicToken(env)`, `exchangePublicToken(publicToken, env)`, `getBalances(accessToken, env)` — consumed by Task 4. `env` is `Pick<Bindings, "PLAID_CLIENT_ID" | "PLAID_SECRET">`.

- [ ] **Step 1: Add Plaid secrets to `Bindings`**

In `api/src/types.ts`, add two fields to the `Bindings` type (after `GEMINI_API_KEY`):

```typescript
  GEMINI_API_KEY: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
```

- [ ] **Step 2: Implement `api/src/plaid/client.ts`**

```typescript
import type { Bindings } from "../types";

const PLAID_BASE = "https://sandbox.plaid.com";
const SANDBOX_INSTITUTION = "ins_109508";

type PlaidEnv = Pick<Bindings, "PLAID_CLIENT_ID" | "PLAID_SECRET">;

export type PlaidAccount = {
  name: string;
  type: string;
  subtype: string | null;
  balances: { available: number | null; current: number | null };
};

// One POST helper for the whole sandbox API; throws on Plaid error_code / non-200.
async function plaidPost<T>(path: string, body: Record<string, unknown>, env: PlaidEnv): Promise<T> {
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const data = (await res.json()) as Record<string, unknown> & { error_code?: string; error_message?: string };
  if (!res.ok || data.error_code) {
    throw new Error(`Plaid ${path} failed: ${data.error_code ?? res.status} ${data.error_message ?? ""}`);
  }
  return data as T;
}

export async function sandboxCreatePublicToken(env: PlaidEnv): Promise<string> {
  const data = await plaidPost<{ public_token: string }>(
    "/sandbox/public_token/create",
    { institution_id: SANDBOX_INSTITUTION, initial_products: ["transactions"] },
    env
  );
  return data.public_token;
}

export async function exchangePublicToken(
  publicToken: string,
  env: PlaidEnv
): Promise<{ accessToken: string; itemId: string }> {
  const data = await plaidPost<{ access_token: string; item_id: string }>(
    "/item/public_token/exchange",
    { public_token: publicToken },
    env
  );
  return { accessToken: data.access_token, itemId: data.item_id };
}

export async function getBalances(accessToken: string, env: PlaidEnv): Promise<PlaidAccount[]> {
  const data = await plaidPost<{ accounts: PlaidAccount[] }>(
    "/accounts/balance/get",
    { access_token: accessToken },
    env
  );
  return data.accounts;
}
```

- [ ] **Step 3: Commit**

```bash
git add api/src/types.ts api/src/plaid/client.ts
git commit -m "feat: add Plaid sandbox REST client + secret bindings"
```

---

## Task 2: Pure scoring module

**Files:**
- Create: `api/src/plaid/scoring.ts`
- Test: `api/test/scoring.spec.ts`

**Interfaces:**
- Consumes: `PlaidAccount` from `api/src/plaid/client.ts`.
- Produces: `bankSafetyScore(accounts: PlaidAccount[]): number`, `behaviorScore(history: BehaviorHistory): number`, `finalScore(bankSafety: number, behavior: number): number`, `THRESHOLD`, `WEIGHTS`, and type `BehaviorHistory = { kycStatus: "pending" | "approved" | "rejected"; fullyPaidCount: number; defaultedCount: number; overdueInstallmentCount: number }` — consumed by Tasks 4 and 5.

- [ ] **Step 1: Write the failing tests**

```typescript
// api/test/scoring.spec.ts
import { describe, expect, it } from "vitest";
import { bankSafetyScore, behaviorScore, finalScore, THRESHOLD } from "../src/plaid/scoring";
import type { PlaidAccount } from "../src/plaid/client";

function acct(type: string, available: number | null): PlaidAccount {
  return { name: "x", type, subtype: null, balances: { available, current: available } };
}

describe("bankSafetyScore", () => {
  it("rewards high liquid depository balance", () => {
    // baseline 50 + 30 (>=10000) + 10 (has depository) = 90
    expect(bankSafetyScore([acct("depository", 15000)])).toBe(90);
  });

  it("ignores non-depository balances for liquidity", () => {
    // investment balance doesn't count as liquid: baseline 50 + 0 band? liquid=0 (<500 -> -15) + 10 = 45
    expect(bankSafetyScore([acct("investment", 50000)])).toBe(45);
  });

  it("penalizes an overdrawn depository account", () => {
    // baseline 50 + (-15, liquid 0 <500... actually -200 counts as liquid sum -200 -> <500 -15) + (-20 overdrawn) + 10 = 25
    expect(bankSafetyScore([acct("depository", -200)])).toBe(25);
  });

  it("clamps to [0,100]", () => {
    expect(bankSafetyScore([])).toBeGreaterThanOrEqual(0);
    expect(bankSafetyScore([acct("depository", 1e9)])).toBeLessThanOrEqual(100);
  });
});

describe("behaviorScore", () => {
  it("gives a clean approved user a high score", () => {
    // baseline 70 + 15 (approved) = 85
    expect(behaviorScore({ kycStatus: "approved", fullyPaidCount: 0, defaultedCount: 0, overdueInstallmentCount: 0 })).toBe(85);
  });

  it("returns 0 when KYC is rejected", () => {
    expect(behaviorScore({ kycStatus: "rejected", fullyPaidCount: 5, defaultedCount: 0, overdueInstallmentCount: 0 })).toBe(0);
  });

  it("rewards repayment history up to a cap and punishes defaults", () => {
    // baseline 70 + 15 approved + min(5*5,20)=20 - 30 default = 75
    expect(behaviorScore({ kycStatus: "approved", fullyPaidCount: 5, defaultedCount: 1, overdueInstallmentCount: 0 })).toBe(75);
  });
});

describe("finalScore", () => {
  it("blends 60/40 and rounds", () => {
    // 0.6*90 + 0.4*85 = 54 + 34 = 88
    expect(finalScore(90, 85)).toBe(88);
  });

  it("THRESHOLD is 50", () => {
    expect(THRESHOLD).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- scoring.spec.ts`
Expected: FAIL — `Cannot find module '../src/plaid/scoring'`.

- [ ] **Step 3: Implement `api/src/plaid/scoring.ts`**

```typescript
import type { PlaidAccount } from "./client";

export const WEIGHTS = { bank: 0.6, behavior: 0.4 } as const;
export const THRESHOLD = 50;

export type BehaviorHistory = {
  kycStatus: "pending" | "approved" | "rejected";
  fullyPaidCount: number;
  defaultedCount: number;
  overdueInstallmentCount: number;
};

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export function bankSafetyScore(accounts: PlaidAccount[]): number {
  const depository = accounts.filter((a) => a.type === "depository");
  const liquid = depository.reduce((sum, a) => sum + (a.balances.available ?? 0), 0);

  let score = 50;
  if (liquid >= 10000) score += 30;
  else if (liquid >= 2000) score += 15;
  else if (liquid < 500) score -= 15;

  if (depository.some((a) => (a.balances.available ?? 0) < 0)) score -= 20;
  if (depository.length > 0) score += 10;

  return clamp(score);
}

export function behaviorScore(history: BehaviorHistory): number {
  if (history.kycStatus === "rejected") return 0;

  let score = 70;
  if (history.kycStatus === "approved") score += 15;
  score += Math.min(history.fullyPaidCount * 5, 20);
  score -= history.defaultedCount * 30;
  score -= history.overdueInstallmentCount * 10;

  return clamp(score);
}

export function finalScore(bankSafety: number, behavior: number): number {
  return Math.round(WEIGHTS.bank * bankSafety + WEIGHTS.behavior * behavior);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api -- scoring.spec.ts`
Expected: PASS — all scoring tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/plaid/scoring.ts api/test/scoring.spec.ts
git commit -m "feat: add pure Plaid risk scoring functions"
```

---

## Task 3: `plaid_items` storage (migration + repository)

**Files:**
- Create: `api/migrations/0002_plaid.sql`
- Create: `api/src/plaid/items.ts`
- Test: folded into Task 4's `plaid.spec.ts` (the repo is exercised through `/connect`; ciphertext-at-rest is asserted there).

**Interfaces:**
- Consumes: `encryptField`/`decryptField` from `api/src/crypto.ts`.
- Produces: `PlaidItemRecord` type and `upsertPlaidItem(db, key, input)`, `getPlaidItem(db, key, userId)` — consumed by Tasks 4 and 5.

- [ ] **Step 1: Write the migration `api/migrations/0002_plaid.sql`**

```sql
-- Plaid bank-connection items (one per user in sandbox). access_token is
-- AES-GCM encrypted at the application layer before insert.
CREATE TABLE plaid_items (
    user_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    institution_name TEXT,
    bank_safety_score REAL NOT NULL,
    bank_signals TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- [ ] **Step 2: Implement `api/src/plaid/items.ts`**

```typescript
import { encryptField, decryptField } from "../crypto";

export type PlaidItemInput = {
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string | null;
  bankSafetyScore: number;
  bankSignals: string; // JSON
};

export type PlaidItemRecord = {
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string | null;
  bankSafetyScore: number;
  bankSignals: string;
};

export async function upsertPlaidItem(
  db: D1Database,
  encryptionKey: string,
  input: PlaidItemInput
): Promise<void> {
  const accessToken = await encryptField(input.accessToken, encryptionKey);
  await db
    .prepare(
      `INSERT INTO plaid_items
         (user_id, item_id, access_token, institution_name, bank_safety_score, bank_signals)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         item_id = excluded.item_id,
         access_token = excluded.access_token,
         institution_name = excluded.institution_name,
         bank_safety_score = excluded.bank_safety_score,
         bank_signals = excluded.bank_signals,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      input.userId,
      input.itemId,
      accessToken,
      input.institutionName,
      input.bankSafetyScore,
      input.bankSignals
    )
    .run();
}

export async function getPlaidItem(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<PlaidItemRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, item_id, access_token, institution_name, bank_safety_score, bank_signals
       FROM plaid_items WHERE user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      item_id: string;
      access_token: string;
      institution_name: string | null;
      bank_safety_score: number;
      bank_signals: string;
    }>();

  if (!row) return null;

  return {
    userId: row.user_id,
    itemId: row.item_id,
    accessToken: await decryptField(row.access_token, encryptionKey),
    institutionName: row.institution_name,
    bankSafetyScore: row.bank_safety_score,
    bankSignals: row.bank_signals,
  };
}
```

- [ ] **Step 3: Apply the migration locally and commit**

Run: `npx wrangler d1 migrations apply microloans_db --local`
Expected: applies `0002_plaid.sql` with no error. (Test runs re-read migrations via `vitest.config.ts`.)

```bash
git add api/migrations/0002_plaid.sql api/src/plaid/items.ts
git commit -m "feat: add encrypted plaid_items storage"
```

---

## Task 4: `POST /api/plaid/connect`

**Files:**
- Create: `api/src/routes/plaid.ts`
- Modify: `api/src/index.ts`
- Test: `api/test/plaid.spec.ts`

**Interfaces:**
- Consumes: Task 1 client fns, Task 2 `bankSafetyScore`, Task 3 `upsertPlaidItem`, `requireAuth`.
- Produces: `plaid` Hono sub-app mounted at `/api/plaid`; `POST /connect` returns `{ bankSafetyScore, signals }` and writes a `plaid_items` row.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/plaid.spec.ts
import { env, fetchMock } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

beforeAll(() => fetchMock.activate());
beforeEach(() => fetchMock.assertNoPendingInterceptors());

async function insertTestUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'h', 'borrower')"
  ).bind(userId, email).run();
}
async function authHeaderFor(userId: string): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role: "borrower" }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

// Fake the three sandbox.plaid.com calls in order.
function stubPlaid(accounts: unknown[]): void {
  const pool = fetchMock.get("https://sandbox.plaid.com");
  pool.intercept({ method: "POST", path: "/sandbox/public_token/create" })
    .reply(200, { public_token: "public-sandbox-x" });
  pool.intercept({ method: "POST", path: "/item/public_token/exchange" })
    .reply(200, { access_token: "access-sandbox-secret-123", item_id: "item-1" });
  pool.intercept({ method: "POST", path: "/accounts/balance/get" })
    .reply(200, { accounts });
}

const RICH = [{ name: "Checking", type: "depository", subtype: "checking", balances: { available: 15000, current: 15000 } }];

describe("POST /api/plaid/connect", () => {
  it("runs the sandbox audit, stores an encrypted item, returns the bank score", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, "plaid@example.com");
    stubPlaid(RICH);

    const res = await app.request(
      "/api/plaid/connect",
      { method: "POST", headers: await authHeaderFor(userId) },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ bankSafetyScore: number }>();
    expect(body.bankSafetyScore).toBe(90);

    // access_token is ciphertext at rest
    const raw = await env.DB.prepare("SELECT access_token, bank_safety_score FROM plaid_items WHERE user_id = ?")
      .bind(userId).first<{ access_token: string; bank_safety_score: number }>();
    expect(raw?.access_token).not.toContain("access-sandbox-secret-123");
    expect(raw?.bank_safety_score).toBe(90);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/plaid/connect", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- plaid.spec.ts`
Expected: FAIL — 404 (no `/api/plaid/connect` route yet).

- [ ] **Step 3: Implement `api/src/routes/plaid.ts`**

```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { sandboxCreatePublicToken, exchangePublicToken, getBalances } from "../plaid/client";
import { bankSafetyScore } from "../plaid/scoring";
import { upsertPlaidItem } from "../plaid/items";
import type { Bindings, Variables } from "../types";

const plaid = new Hono<{ Bindings: Bindings; Variables: Variables }>();

plaid.post("/connect", requireAuth, async (c) => {
  const userId = c.var.userId;

  let accounts;
  let itemId: string;
  let accessToken: string;
  try {
    const publicToken = await sandboxCreatePublicToken(c.env);
    const exchanged = await exchangePublicToken(publicToken, c.env);
    accessToken = exchanged.accessToken;
    itemId = exchanged.itemId;
    accounts = await getBalances(accessToken, c.env);
  } catch {
    return c.json({ error: "Bank audit failed" }, 502);
  }

  const score = bankSafetyScore(accounts);
  const signals = {
    liquidDepository: accounts
      .filter((a) => a.type === "depository")
      .reduce((s, a) => s + (a.balances.available ?? 0), 0),
    accountCount: accounts.length,
  };

  await upsertPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
    userId,
    itemId,
    accessToken,
    institutionName: "First Platypus Bank",
    bankSafetyScore: score,
    bankSignals: JSON.stringify(signals),
  });

  return c.json({ bankSafetyScore: score, signals });
});

export default plaid;
```

- [ ] **Step 4: Mount in `api/src/index.ts`**

Add the import and route (alongside the existing mounts):

```typescript
import plaid from "./routes/plaid";
// ...
app.route("/api/plaid", plaid);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix api -- plaid.spec.ts`
Expected: PASS — both tests.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/plaid.ts api/src/index.ts api/test/plaid.spec.ts
git commit -m "feat: add POST /api/plaid/connect sandbox bank audit"
```

---

## Task 5: Gate `POST /api/loans/` on the final score

**Files:**
- Modify: `api/src/routes/loans.ts`
- Modify: `api/test/loans.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`behaviorScore`, `finalScore`, `THRESHOLD`, `BehaviorHistory`), Task 3 (`getPlaidItem`), existing `requireAuth`.
- Produces: modified `POST /` — 428 if no bank item, 403 if `finalScore < THRESHOLD` (no loan row), else 201 with `risk_assessment_score` + `risk_assessment_summary` populated.

- [ ] **Step 1: Write the failing tests (append to `api/test/loans.spec.ts`)**

Add a helper to seed a `plaid_items` row and tests. Use the existing test helpers in the file for users/auth (match their names; if absent, mirror Task 4's `insertTestUser`/`authHeaderFor`). Seed an approved profile so behavior is high.

```typescript
// --- appended to api/test/loans.spec.ts ---
import { upsertPlaidItem } from "../src/plaid/items";

async function seedBank(userId: string, score: number): Promise<void> {
  await upsertPlaidItem(env.DB, env.PII_ENCRYPTION_KEY, {
    userId,
    itemId: "item-x",
    accessToken: "access-sandbox-x",
    institutionName: "Test Bank",
    bankSafetyScore: score,
    bankSignals: "{}",
  });
}
async function seedApprovedProfile(userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO profiles (user_id, first_name, last_name, phone, address, national_id_number, kyc_status)
     VALUES (?, 'e','e','` + // encrypted-or-not values are irrelevant to scoring; uniqueness only
      crypto.randomUUID() + `','e',?,'approved')`
  ).bind(userId, crypto.randomUUID()).run();
}

describe("POST /api/loans gate", () => {
  it("returns 428 when the borrower has no connected bank", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, `nogate-${userId}@e.com`);
    const res = await app.request(
      "/api/loans/",
      { method: "POST", headers: { ...(await authHeaderFor(userId)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1000, termMonths: 6 }) },
      env
    );
    expect(res.status).toBe(428);
  });

  it("hard-gates a low final score with 403 and creates no loan", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, `low-${userId}@e.com`);
    await seedBank(userId, 0); // bank 0; no approved profile -> behavior 70 -> final round(.6*0+.4*70)=28 < 50
    const res = await app.request(
      "/api/loans/",
      { method: "POST", headers: { ...(await authHeaderFor(userId)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1000, termMonths: 6 }) },
      env
    );
    expect(res.status).toBe(403);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM loans WHERE borrower_id = ?")
      .bind(userId).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("creates a loan with the score attached when above threshold", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, `ok-${userId}@e.com`);
    await seedApprovedProfile(userId);
    await seedBank(userId, 90); // bank 90; behavior 85 -> final 88
    const res = await app.request(
      "/api/loans/",
      { method: "POST", headers: { ...(await authHeaderFor(userId)), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1000, termMonths: 6 }) },
      env
    );
    expect(res.status).toBe(201);
    const loan = await env.DB.prepare("SELECT risk_assessment_score FROM loans WHERE borrower_id = ?")
      .bind(userId).first<{ risk_assessment_score: number }>();
    expect(loan?.risk_assessment_score).toBe(88);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- loans.spec.ts`
Expected: FAIL — current `POST /` ignores the bank/score (no 428/403, no `risk_assessment_score`).

- [ ] **Step 3: Add a behavior-history loader + gate to `api/src/routes/loans.ts`**

Add imports at the top:

```typescript
import { getPlaidItem } from "../plaid/items";
import { behaviorScore, finalScore, THRESHOLD, type BehaviorHistory } from "../plaid/scoring";
```

Add this helper above the route definitions (after `const loans = ...`):

```typescript
async function loadBehaviorHistory(db: D1Database, key: string, userId: string): Promise<BehaviorHistory> {
  const profile = await db.prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
    .bind(userId).first<{ kyc_status: "pending" | "approved" | "rejected" }>();

  const counts = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'fully_paid' THEN 1 ELSE 0 END), 0) AS fully_paid,
       COALESCE(SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END), 0) AS defaulted
     FROM loans WHERE borrower_id = ?`
  ).bind(userId).first<{ fully_paid: number; defaulted: number }>();

  const overdue = await db.prepare(
    `SELECT COUNT(*) AS n FROM installments i
       JOIN loans l ON l.id = i.loan_id
     WHERE l.borrower_id = ? AND i.status = 'overdue'`
  ).bind(userId).first<{ n: number }>();

  return {
    kycStatus: profile?.kyc_status ?? "pending",
    fullyPaidCount: counts?.fully_paid ?? 0,
    defaultedCount: counts?.defaulted ?? 0,
    overdueInstallmentCount: overdue?.n ?? 0,
  };
}
```

Replace the body of `loans.post("/", requireAuth, async (c) => { ... })` with:

```typescript
loans.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; termMonths: number }>();

  if (body.amount <= 0 || body.termMonths <= 0) {
    return c.json({ error: "amount and termMonths must be positive" }, 400);
  }

  const userId = c.var.userId;

  const bank = await getPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  if (!bank) {
    return c.json({ error: "Bank audit required; connect a bank via /api/plaid/connect first" }, 428);
  }

  const history = await loadBehaviorHistory(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  const behavior = behaviorScore(history);
  const score = finalScore(bank.bankSafetyScore, behavior);
  const summary = JSON.stringify({
    finalScore: score,
    bankSafety: bank.bankSafetyScore,
    behavior,
    weights: { bank: 0.6, behavior: 0.4 },
    threshold: THRESHOLD,
  });

  if (score < THRESHOLD) {
    return c.json({ error: "Risk score below threshold", finalScore: score, summary: JSON.parse(summary) }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status, risk_assessment_score, risk_assessment_summary)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(id, userId, body.amount, FLAT_INTEREST_RATE, body.termMonths, score, summary)
    .run();

  return c.json({ id, status: "pending", riskScore: score }, 201);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api -- loans.spec.ts`
Expected: PASS — gate tests plus the existing loans tests. NOTE: pre-existing loans tests that POST a loan will now 428 — update each to call `seedBank(userId, 90)` and `seedApprovedProfile(userId)` before posting (so they reach 201). Make that edit, then re-run.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/loans.ts api/test/loans.spec.ts
git commit -m "feat: gate loan creation on Plaid + behavior risk score"
```

---

## Task 6: Session + profile read endpoints

**Files:**
- Modify: `api/src/routes/auth.ts` (add `GET /me`)
- Create: `api/src/routes/profile.ts` (`GET /`)
- Modify: `api/src/index.ts` (mount `/api/profile`)
- Test: `api/test/profile.spec.ts` (covers both); add a `GET /me` case to `api/test/auth.spec.ts`

**Interfaces:**
- Consumes: `requireAuth`, `getProfile` (`api/src/profiles.ts`), `getPlaidItem` (Task 3).
- Produces: `GET /api/auth/me` → `{ userId, email, role }`; `GET /api/profile` → `{ profile, kycStatus, bankConnected, bankSafetyScore }` (profile null if no KYC yet).

- [ ] **Step 1: Write the failing tests**

```typescript
// api/test/profile.spec.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

async function user(role: "borrower" | "officer" = "borrower") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'h', ?)")
    .bind(id, `${id}@e.com`, role).run();
  const token = await signJwt({ sub: id, role }, env.JWT_SECRET, 3600);
  return { id, headers: { Authorization: `Bearer ${token}` } };
}

describe("GET /api/auth/me", () => {
  it("returns the current user's id, email, role", async () => {
    const u = await user("officer");
    const res = await app.request("/api/auth/me", { headers: u.headers }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ userId: string; role: string; email: string }>();
    expect(body.userId).toBe(u.id);
    expect(body.role).toBe("officer");
    expect(body.email).toBe(`${u.id}@e.com`);
  });

  it("401 without auth", async () => {
    const res = await app.request("/api/auth/me", {}, env);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/profile", () => {
  it("reports no profile / no bank for a fresh user", async () => {
    const u = await user();
    const res = await app.request("/api/profile", { headers: u.headers }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ profile: unknown; bankConnected: boolean }>();
    expect(body.profile).toBeNull();
    expect(body.bankConnected).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- profile.spec.ts`
Expected: FAIL — 404 (routes not present).

- [ ] **Step 3: Add `GET /me` to `api/src/routes/auth.ts`**

Add before `export default auth;`:

```typescript
auth.get("/me", requireAuth, async (c) => {
  const userId = c.var.userId;
  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId).first<{ email: string }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ userId, email: user.email, role: c.var.role });
});
```

- [ ] **Step 4: Create `api/src/routes/profile.ts`**

```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { getProfile } from "../profiles";
import { getPlaidItem } from "../plaid/items";
import type { Bindings, Variables } from "../types";

const profile = new Hono<{ Bindings: Bindings; Variables: Variables }>();

profile.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;
  const record = await getProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  const bank = await getPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);

  return c.json({
    profile: record,
    kycStatus: record?.kycStatus ?? null,
    bankConnected: bank !== null,
    bankSafetyScore: bank?.bankSafetyScore ?? null,
  });
});

export default profile;
```

- [ ] **Step 5: Mount in `api/src/index.ts`**

```typescript
import profile from "./routes/profile";
// ...
app.route("/api/profile", profile);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --prefix api -- profile.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/auth.ts api/src/routes/profile.ts api/src/index.ts api/test/profile.spec.ts
git commit -m "feat: add GET /api/auth/me and GET /api/profile"
```

---

## Task 7: Loan listing, reject, and ownership authorization

**Files:**
- Modify: `api/src/routes/loans.ts`
- Modify: `api/test/loans.spec.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole`, `c.var.userId`, `c.var.role`.
- Produces: `GET /api/loans` (borrower→own; officer/admin→all, optional `?status=`); `POST /api/loans/:id/reject` (officer/admin); ownership guard on `GET /api/loans/:id` (borrower can read only own).

- [ ] **Step 1: Write the failing tests (append to `api/test/loans.spec.ts`)**

```typescript
describe("loan listing, reject, authz", () => {
  it("borrower lists only their own loans", async () => {
    const a = crypto.randomUUID(); await insertTestUser(a, `a-${a}@e.com`);
    const b = crypto.randomUUID(); await insertTestUser(b, `b-${b}@e.com`);
    await env.DB.prepare("INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status) VALUES (?,?,100,0.05,6,'pending')").bind(crypto.randomUUID(), a).run();
    await env.DB.prepare("INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status) VALUES (?,?,100,0.05,6,'pending')").bind(crypto.randomUUID(), b).run();

    const res = await app.request("/api/loans", { headers: await authHeaderFor(a) }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ loans: { borrower_id: string }[] }>();
    expect(body.loans.every((l) => l.borrower_id === a)).toBe(true);
    expect(body.loans.length).toBe(1);
  });

  it("officer can filter pending loans across borrowers", async () => {
    const off = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?,?, 'h','officer')").bind(off, `off-${off}@e.com`).run();
    const token = await signJwt({ sub: off, role: "officer" }, env.JWT_SECRET, 3600);
    const res = await app.request("/api/loans?status=pending", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
  });

  it("borrower cannot read another borrower's loan by id (404)", async () => {
    const a = crypto.randomUUID(); await insertTestUser(a, `c-${a}@e.com`);
    const b = crypto.randomUUID(); await insertTestUser(b, `d-${b}@e.com`);
    const loanId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status) VALUES (?,?,100,0.05,6,'pending')").bind(loanId, b).run();
    const res = await app.request(`/api/loans/${loanId}`, { headers: await authHeaderFor(a) }, env);
    expect(res.status).toBe(404);
  });

  it("officer rejects a pending loan", async () => {
    const borrower = crypto.randomUUID(); await insertTestUser(borrower, `e-${borrower}@e.com`);
    const loanId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status) VALUES (?,?,100,0.05,6,'pending')").bind(loanId, borrower).run();
    const off = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?,?, 'h','officer')").bind(off, `off2-${off}@e.com`).run();
    const token = await signJwt({ sub: off, role: "officer" }, env.JWT_SECRET, 3600);
    const res = await app.request(`/api/loans/${loanId}/reject`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT status FROM loans WHERE id = ?").bind(loanId).first<{ status: string }>();
    expect(row?.status).toBe("defaulted"); // see note in Step 3 on chosen rejected status
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api -- loans.spec.ts`
Expected: FAIL — `GET /api/loans` 404, no reject route, `GET /:id` returns 200 cross-borrower.

- [ ] **Step 3: Implement list + reject + authz in `api/src/routes/loans.ts`**

The `loans` schema `status` CHECK has no `'rejected'` value (`pending, under_review, approved, active, fully_paid, defaulted`). To avoid a migration, reject sets `status = 'defaulted'` (the terminal non-active state) and records the officer in `approved_by`. (If a distinct `rejected` state is wanted later, add it via migration.)

Add the list route (place after `loans.post("/", ...)`):

```typescript
loans.get("/", requireAuth, async (c) => {
  const status = c.req.query("status");
  const isStaff = c.var.role === "officer" || c.var.role === "admin";

  let query = "SELECT * FROM loans";
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (!isStaff) {
    conditions.push("borrower_id = ?");
    binds.push(c.var.userId);
  }
  if (status) {
    conditions.push("status = ?");
    binds.push(status);
  }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC";

  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ loans: results });
});
```

Replace the `GET /:id` handler's loan lookup to enforce ownership. Change:

```typescript
  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first();
  if (!loan) {
    return c.json({ error: "Loan not found" }, 404);
  }
```

to:

```typescript
  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<{ borrower_id: string }>();
  const isStaff = c.var.role === "officer" || c.var.role === "admin";
  if (!loan || (!isStaff && loan.borrower_id !== c.var.userId)) {
    return c.json({ error: "Loan not found" }, 404);
  }
```

Add the reject route (after the approve route):

```typescript
loans.post("/:id/reject", requireAuth, requireRole("officer", "admin"), async (c) => {
  const loanId = c.req.param("id");
  const result = await c.env.DB.prepare(
    "UPDATE loans SET status = 'defaulted', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  ).bind(c.var.userId, loanId).run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Pending loan not found" }, 404);
  }
  return c.json({ id: loanId, status: "defaulted" });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — full suite (new authz/list/reject tests + everything else).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/loans.ts api/test/loans.spec.ts
git commit -m "feat: loan listing, officer reject, and GET /:id ownership check"
```

---

## Task 8: Deploy + production smoke

**Files:** none (deploy-only).

- [ ] **Step 1: Set Plaid secrets in prod**

```bash
printf '%s' "$PLAID_CLIENT_ID_VALUE" | npx wrangler secret put PLAID_CLIENT_ID
printf '%s' "$PLAID_SECRET_VALUE" | npx wrangler secret put PLAID_SECRET
```
(Values are in the gitignored `.dev.vars`.)

- [ ] **Step 2: Apply the new migration to remote D1**

Run: `npx wrangler d1 migrations apply microloans_db --remote`
Expected: applies `0002_plaid.sql`.

- [ ] **Step 3: Merge to main and deploy**

```bash
git checkout main && git merge --no-ff feat/plaid-and-mvp-endpoints -m "Merge feat/plaid-and-mvp-endpoints"
npx wrangler deploy
```

- [ ] **Step 4: Smoke the deployed endpoints**

Confirm `GET /api/health` → 200, `POST /api/plaid/connect` → 401 without auth, `GET /api/auth/me` → 401 without auth. (A full authed run needs a registered user + real Turnstile token; the unauth checks prove the routes are wired.)

- [ ] **Step 5: Commit the plan completion marker**

```bash
git add docs/superpowers/plans/2026-06-25-plaid-and-mvp-endpoints.md
git commit -m "docs: mark plaid-and-mvp-endpoints plan executed"
```

---

## Self-Review Notes

- **Spec coverage:** Plaid client (T1), scoring (T2), encrypted storage (T3), `/connect` (T4), loan gate with 428/403/201 + stored summary (T5) cover the design spec in full. MVP gaps (`GET /me`, `GET /profile`, `GET /loans` list, `POST /:id/reject`, `GET /:id` authz) are T6–T7. Deploy + secrets + remote migration are T8.
- **Type consistency:** `PlaidAccount` (T1) flows into `bankSafetyScore` (T2), `/connect` (T4); `BehaviorHistory` (T2) is produced by `loadBehaviorHistory` (T5); `getPlaidItem`/`upsertPlaidItem` (T3) consumed by T4/T5/T6; `PII_ENCRYPTION_KEY` is the encryption key for `plaid_items` (consistent with profiles). `THRESHOLD`/`WEIGHTS` defined once in T2 and reused in T5.
- **Known deliberate choices:** reject reuses `status='defaulted'` (no `rejected` in the schema CHECK) to avoid a migration; bankSafety uses absolute liquidity (amount-aware coverage deferred); transactions-based income deferred — all per spec "Out of scope".
- **Test seams:** all outbound Plaid calls faked via the pool's `fetchMock`; no `globalThis.fetch` spy; ciphertext-at-rest asserted in T4.
