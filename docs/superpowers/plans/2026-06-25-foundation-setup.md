# Foundation & Core API Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Cloudflare Workers monorepo (Wrangler + Hono + D1 + KV + R2 bindings) with a working, tested health endpoint and a fully migrated D1 schema, so every later feature plan (auth, loans, KYC/AI, frontend) has a real foundation to build on.

**Architecture:** A single Cloudflare Worker (`api/src/index.ts`) built with the Hono framework handles all `/api/`* routes. Cloudflare D1 (SQLite) is the system of record, bound as `DB`. Cloudflare KV (`LOAN_CACHE`) and R2 (`KYC_BUCKET`) are bound but unused until later plans. Tests run against the real Workers runtime via `@cloudflare/vitest-pool-workers`, which spins up Miniflare with the same bindings defined in `wrangler.toml` — no mocking of D1/KV/R2.

**Tech Stack:** TypeScript, Wrangler CLI, Hono, Cloudflare D1/KV/R2, Vitest + `@cloudflare/vitest-pool-workers`.

## Global Constraints

- `compatibility_date = "2026-06-25"` (from CLOUDFLARE_MICROLOAN_PLAN.md §5) — use this exact value in `wrangler.toml`.
- Worker entrypoint must be `api/src/index.ts` (per CLOUDFLARE_MICROLOAN_PLAN.md §5 folder layout).
- D1 binding name is `DB`, KV binding name is `LOAN_CACHE`, R2 binding name is `KYC_BUCKET`, AI binding name is `AI` (per CLOUDFLARE_MICROLOAN_PLAN.md §5 wrangler.toml).
- D1 schema must exactly match CLOUDFLARE_MICROLOAN_PLAN.md §3 (six tables: `users`, `profiles`, `loans`, `installments`, `transactions`, `audit_logs`, plus the five indexes listed).
- Migrations live under `./api/migrations` (per CLOUDFLARE_MICROLOAN_PLAN.md §5 wrangler.toml `migrations_dir`).
- No secrets committed; `wrangler.toml` only holds binding names/ids, never key material.

---

## File Structure

```
microloans/
├── package.json                       # root workspace scripts (dev, test, deploy)
├── wrangler.toml                      # Cloudflare bindings + worker entry
├── tsconfig.json                      # root TS config referenced by api/tsconfig.json
├── api/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts              # vitest-pool-workers config
│   ├── migrations/
│   │   └── 0001_initial_schema.sql   # the six tables + indexes from §3
│   ├── src/
│   │   ├── index.ts                  # Hono app, exports default fetch handler
│   │   └── routes/
│   │       └── health.ts             # GET /api/health → checks DB connectivity
│   └── test/
│       └── health.spec.ts            # integration test against real Miniflare D1
```

- `index.ts` stays a thin router: it imports route modules and mounts them. This keeps it from growing into a god file as auth/loans/kyc routes are added in later plans.
- `routes/health.ts` is its own file because later plans will add `routes/auth.ts`, `routes/loans.ts`, etc. — one file per route group, consistent with CLOUDFLARE_MICROLOAN_PLAN.md §5's `db.ts`/`ai.ts`/`crypto.ts` split.

---

## Task 1: Root Workspace & Wrangler Project Init

**Files:**

- Create: `package.json`
- Create: `wrangler.toml`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Interfaces:**

- Produces: root `npm run dev` (runs `wrangler dev`), `npm test` (runs `npm test --prefix api`), `npm run deploy` (runs `wrangler deploy`).

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "microloans-platform",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "wrangler dev",
    "test": "npm test --prefix api",
    "deploy": "npm run build --prefix frontend && wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.wrangler/
dist/
*.local
.dev.vars
```

- [ ] **Step 4: Create `wrangler.toml`**

```toml
name = "microloans-platform"
main = "api/src/index.ts"
compatibility_date = "2026-06-25"

[site]
bucket = "./frontend/dist"

[[kv_namespaces]]
binding = "LOAN_CACHE"
id = "xxxxxxxxxxxx_kv_id"
preview_id = "xxxxxxxxxxxx_kv_preview_id"

[[d1_databases]]
binding = "DB"
database_name = "microloans_db"
database_id = "xxxxxxxxxxxx_db_id"
migrations_dir = "./api/migrations"

[[r2_buckets]]
binding = "KYC_BUCKET"
bucket_name = "microloans-kyc"

[ai]
binding = "AI"
```

- [ ] **Step 5: Install root dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json tsconfig.json wrangler.toml .gitignore package-lock.json
git commit -m "chore: init wrangler workspace and root config"
```

---

## Task 2: D1 Schema Migration

**Files:**

- Create: `api/migrations/0001_initial_schema.sql`

**Interfaces:**

- Produces: six tables (`users`, `profiles`, `loans`, `installments`, `transactions`, `audit_logs`) and five indexes, queryable via the `DB` binding — required by Task 4's health check and every later feature plan.

- [ ] **Step 1: Write the migration file**

```sql
-- 1. Users Table (Core Auth & Roles)
CREATE TABLE users (
    id TEXT PRIMARY KEY, -- UUIDv4
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('borrower', 'officer', 'admin')) NOT NULL DEFAULT 'borrower',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profiles Table (KYC & PII - Encrypted in application layer before save)
CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    national_id_number TEXT UNIQUE NOT NULL,
    kyc_status TEXT CHECK(kyc_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    kyc_document_r2_key TEXT,
    ocr_extracted_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Loans Table (Active and Requested Loans)
CREATE TABLE loans (
    id TEXT PRIMARY KEY, -- UUIDv4
    borrower_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    interest_rate REAL NOT NULL CHECK(interest_rate >= 0),
    term_months INTEGER NOT NULL CHECK(term_months > 0),
    status TEXT CHECK(status IN ('pending', 'under_review', 'approved', 'active', 'fully_paid', 'defaulted')) DEFAULT 'pending',
    risk_assessment_score REAL,
    risk_assessment_summary TEXT,
    approved_by TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(borrower_id) REFERENCES users(id),
    FOREIGN KEY(approved_by) REFERENCES users(id)
);

-- 4. Installments Table (Loan Amortization Schedule)
CREATE TABLE installments (
    id TEXT PRIMARY KEY, -- UUIDv4
    loan_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount_due REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    status TEXT CHECK(status IN ('unpaid', 'partial', 'paid', 'overdue')) DEFAULT 'unpaid',
    paid_at TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- 5. Transactions Table (Double-Entry Ledger)
CREATE TABLE transactions (
    id TEXT PRIMARY KEY, -- UUIDv4
    loan_id TEXT NOT NULL,
    installment_id TEXT,
    type TEXT CHECK(type IN ('disbursement', 'repayment', 'fee', 'interest_charge')) NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT CHECK(payment_method IN ('stripe', 'bank_transfer', 'mock_gateway')) NOT NULL,
    external_reference_id TEXT,
    status TEXT CHECK(status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(loan_id) REFERENCES loans(id),
    FOREIGN KEY(installment_id) REFERENCES installments(id)
);

-- 6. Audit Logs Table
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, -- UUIDv4
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loans_borrower ON loans(borrower_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_installments_loan_due ON installments(loan_id, due_date);
CREATE INDEX idx_transactions_loan ON transactions(loan_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
```

- [ ] **Step 2: Create the local D1 database and apply the migration**

Run:

```bash
npx wrangler d1 create microloans_db
```

Expected: prints a `database_id` — copy it into `wrangler.toml`'s `[[d1_databases]]` block, replacing `xxxxxxxxxxxx_db_id`.

Run:

```bash
npx wrangler d1 execute microloans_db --local --file=./api/migrations/0001_initial_schema.sql
```

Expected: `🌀 Executing on local database microloans_db` followed by success output, no SQL errors.

- [ ] **Step 3: Verify the schema applied**

Run:

```bash
npx wrangler d1 execute microloans_db --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: output lists `users`, `profiles`, `loans`, `installments`, `transactions`, `audit_logs`.

- [ ] **Step 4: Commit**

```bash
git add api/migrations/0001_initial_schema.sql wrangler.toml
git commit -m "feat: add D1 initial schema migration"
```

---

## Task 3: Hono API Skeleton with Tested Health Endpoint

**Files:**

- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/vitest.config.ts`
- Create: `api/src/index.ts`
- Create: `api/src/routes/health.ts`
- Test: `api/test/health.spec.ts`

**Interfaces:**

- Consumes: `DB` binding (D1Database type from `@cloudflare/workers-types`), produced by Task 2's migration.
- Produces: `app` default export from `api/src/index.ts` (a Hono instance) — every later route-group plan (auth, loans, kyc) imports and mounts onto this `app` via `app.route(path, subApp)`. `GET /api/health` returns `{ status: "ok", db: "connected" }` with HTTP 200 when D1 is reachable.

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "name": "microloans-api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.6.0",
    "@cloudflare/workers-types": "^4.20260601.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"],
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `api/vitest.config.ts`**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "../wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 4: Install API dependencies**

Run: `npm install --prefix api`
Expected: `api/node_modules/` created, no errors.

- [ ] **Step 5: Write the failing test**

```typescript
// api/test/health.spec.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /api/health", () => {
  it("returns ok status and confirms DB connectivity", async () => {
    const res = await app.request("/api/health", {}, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", db: "connected" });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/index'` (file doesn't exist yet).

- [ ] **Step 7: Write `api/src/routes/health.ts`**

```typescript
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const health = new Hono<{ Bindings: Bindings }>();

health.get("/", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", db: "connected" });
});

export default health;
```

- [ ] **Step 8: Write `api/src/index.ts`**

```typescript
import { Hono } from "hono";
import health from "./routes/health";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/api/health", health);

export default app;
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — `GET /api/health > returns ok status and confirms DB connectivity`.

- [ ] **Step 10: Commit**

```bash
git add api/package.json api/tsconfig.json api/vitest.config.ts api/src/index.ts api/src/routes/health.ts api/test/health.spec.ts api/package-lock.json
git commit -m "feat: add Hono API skeleton with tested health endpoint"
```

---

## Task 4: Local Dev Smoke Test (Wrangler Dev Server)

**Files:**

- Modify: none (verification-only task)

**Interfaces:**

- Consumes: `app` from Task 3, migrated schema from Task 2, bindings from Task 1's `wrangler.toml`.
- Produces: confirmation that the full binding chain (Worker → D1/KV/R2) works outside the test runner, under the real `wrangler dev` process — this is the gate before any later plan (auth, loans, kyc) builds on top.

- [ ] **Step 1: Start the dev server**

Run: `npx wrangler dev --local`
Expected: console prints `Ready on http://localhost:8787` (or similar), no binding errors for `DB`, `LOAN_CACHE`, `KYC_BUCKET`, `AI`.

- [ ] **Step 2: Hit the health endpoint**

Run (in a second terminal): `curl -s http://localhost:8787/api/health`
Expected output: `{"status":"ok","db":"connected"}`

- [ ] **Step 3: Stop the dev server**

Press `Ctrl+C` in the terminal running `wrangler dev`.

- [ ] **Step 4: Commit (docs only — records the verified milestone)**

```bash
git add docs/superpowers/plans/2026-06-25-foundation-setup.md
git commit -m "docs: mark foundation plan verified end-to-end via wrangler dev"
```

---

## Roadmap: Plans to Write Next

This plan only covers the foundation. The following subsystem plans should each be written as their own `docs/superpowers/plans/YYYY-MM-DD-<name>.md` file once this one is merged, since each is independently testable and depends on the foundation above:

1. `**auth-and-sessions**` — registration/login, JWT issuance, KV-backed session/blacklist, Turnstile verification middleware (CLOUDFLARE_MICROLOAN_PLAN.md §2 Workers/KV/Turnstile rows, §4.C.3).
2. `**pii-encryption**` — AES-GCM Web Crypto helpers (`api/src/crypto.ts`) for encrypting `profiles` PII fields before D1 writes (CLOUDFLARE_MICROLOAN_PLAN.md §4.C.1).
3. `**loan-and-ledger-core**` — loan request endpoint, installment schedule generation, double-entry transaction writes (CLOUDFLARE_MICROLOAN_PLAN.md §3 loans/installments/transactions, §6 Phase 2.3).
4. `**kyc-ocr-pipeline**` — R2 upload + Workers AI vision OCR extraction into `profiles` (CLOUDFLARE_MICROLOAN_PLAN.md §4.A).
5. `**credit-risk-engine**` — Workers AI LLM underwriting score/summary writer for `loans` (CLOUDFLARE_MICROLOAN_PLAN.md §4.B).
6. `**borrower-frontend**` — Vite + React app, Turnstile widget, loan application flow (CLOUDFLARE_MICROLOAN_PLAN.md §5 frontend folder, §6 Phase 4).
7. `**admin-and-zero-trust**` — admin dashboard for officers, Cloudflare Access policy on `/admin/*` (CLOUDFLARE_MICROLOAN_PLAN.md §4.C.2, §6 Phase 5.1).
8. `**production-deploy**` — secrets provisioning, `wrangler deploy` / Pages deploy pipeline (CLOUDFLARE_MICROLOAN_PLAN.md §6 Phase 5.2–5.3).

---

## Self-Review Notes

- **Spec coverage:** Tasks 1–4 cover CLOUDFLARE_MICROLOAN_PLAN.md §5 (folder layout, wrangler.toml) and §3 (full schema) and §6 Phase 1 verbatim. Phases 2–5 are intentionally deferred to the roadmap above since they are independent subsystems.
- **Placeholder scan:** no TBD/TODO markers; every step has literal file contents and exact commands.
- **Type consistency:** `Bindings` type (`{ DB: D1Database }`) is identical across `health.ts` and `index.ts`; `health` sub-app is imported and mounted by exact name in both files.

