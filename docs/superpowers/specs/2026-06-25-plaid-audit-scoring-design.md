# Plaid Audit + Risk Scoring — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design); pending implementation plan
**Source requirements:** User request — audit a borrower's bank (via Plaid Sandbox) before they request/accept a loan, then combine **bank safety** + **internal app behavior** into a final risk score that gates the loan.

## Goal

Before a borrower can create a loan request, they must connect a bank account (Plaid **Sandbox**, server-side, no frontend). The platform pulls their balances, derives a **bank-safety sub-score**, blends it with an **internal-behavior sub-score** computed from our own data (KYC + loan history), and produces a **final risk score (0–100)**. The score **hard-gates** the loan (below threshold → rejected, no loan created) and, on pass, is stored on the loan for officer review (**advisory**).

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Loan model | **Borrower-only, two actions** (request / accept) | Current schema has no lender role; "post" = create a loan request. No schema role change. |
| Plaid connection | **Server-side sandbox flow** (`/sandbox/public_token/create` → exchange) | No frontend exists; this is fully testable now. Real Plaid Link (`link_token`) deferred until a frontend exists. |
| Score effect | **Hard gate + advisory** | `finalScore < THRESHOLD` → 403, no loan. Else create loan with score + summary for the officer. |
| Scoring weights | **60% bank safety + 40% internal behavior**, threshold **50** | Sane defaults; constants centralized for easy tuning. |
| Bank-safety primary signal | **Sum of depository `available` balances** | Immediate + reliable in sandbox; `/transactions/get` can return `PRODUCT_NOT_READY` right after item creation. |
| Plaid client | **Thin `fetch` wrapper, no `plaid` npm SDK** | The SDK is Node-oriented and heavy for Workers; a handful of REST calls is lighter. |
| `access_token` at rest | **AES-GCM encrypted via existing `encryptField`** | It is a bank credential; must never sit in D1 as plaintext (same policy as PII). |
| Re-pull freshness | **Cache the connect-time balance snapshot on `plaid_items`; reuse at loan time** | Sandbox data is static; avoids extra API calls. Re-pull / webhooks deferred. |

## Architecture & endpoints

```
POST /api/plaid/connect   (requireAuth, borrower)   — "the audit"
  ├─ POST sandbox.plaid.com/sandbox/public_token/create
  │     { client_id, secret, institution_id: "ins_109508", initial_products: ["transactions"] }
  ├─ POST /item/public_token/exchange  → { access_token, item_id }
  ├─ POST /accounts/balance/get        → { accounts:[{ type, subtype, balances:{available,current} }] }
  ├─ bankSafetyScore(accounts) → 0..100  (pure)
  ├─ UPSERT plaid_items (user_id, item_id, ENC(access_token), institution_name,
  │                      bank_safety_score, bank_signals JSON)
  └─ 200 { bankSafetyScore, signals }

POST /api/loans/   (requireAuth)   — MODIFIED, the gate
  ├─ load plaid_items for user      → 428 "bank audit required" if absent
  ├─ behaviorScore(db history) → 0..100  (pure, from KYC + prior loans/installments)
  ├─ finalScore = round(0.6*bankSafety + 0.4*behavior)
  ├─ finalScore < THRESHOLD (50)    → 403 { error, finalScore, breakdown }   (no loan)
  └─ else INSERT loan (status 'pending',
              risk_assessment_score = finalScore,
              risk_assessment_summary = JSON breakdown)            → 201
```

## Scoring model (`api/src/plaid/scoring.ts`, pure & unit-tested)

All sub-scores clamp to `[0, 100]`. Constants live at the top of the module for tuning.

**`bankSafetyScore(accounts)`** — baseline 50:
- `liquid` = Σ `available` of `type === "depository"` accounts.
- Absolute-liquidity bands: `liquid ≥ 10000` → +30; `≥ 2000` → +15; `< 500` → −15.
- Any depository account with negative `available` (overdrawn) → −20.
- At least one depository account present → +10.

> Note: `requestedAmount` is unknown at `/connect`, so the **stored** `bank_safety_score` uses the absolute-liquidity bands above, and the loan-time `finalScore` consumes that stored score as-is. Amount-aware coverage is a documented future enhancement, not v1.

**`behaviorScore(history)`** — baseline 70, where `history = { kycStatus, fullyPaidCount, defaultedCount, overdueInstallmentCount }`:
- `kycStatus === "approved"` → +15; `"rejected"` → return **0** (and the loan route blocks).
- `+5` per `fully_paid` loan, capped at `+20`.
- `−30` per `defaulted` loan.
- `−10` per currently `overdue` installment.

**`finalScore(bankSafety, behavior)`** = `Math.round(0.6 * bankSafety + 0.4 * behavior)`.
**`THRESHOLD = 50`** — `finalScore < THRESHOLD` ⇒ loan rejected.

The `risk_assessment_summary` stored on the loan is the JSON breakdown: `{ finalScore, bankSafety, behavior, weights, threshold, signals }`.

## Storage — new migration `api/migrations/0002_plaid.sql`

```sql
CREATE TABLE plaid_items (
    user_id TEXT PRIMARY KEY,                 -- one connected bank per user (sandbox)
    item_id TEXT NOT NULL,
    access_token TEXT NOT NULL,               -- AES-GCM encrypted (encryptField)
    institution_name TEXT,
    bank_safety_score REAL NOT NULL,
    bank_signals TEXT NOT NULL,               -- JSON snapshot of derived signals
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Final score + summary reuse the **existing** `loans.risk_assessment_score` (REAL) and `loans.risk_assessment_summary` (TEXT) columns — no loans migration needed.

## Code units

- `api/src/plaid/client.ts` — `plaidFetch(path, body, env)` thin wrapper over `https://sandbox.plaid.com`, injecting `client_id`/`secret`; typed helpers `sandboxCreatePublicToken`, `exchangePublicToken`, `getBalances`. Throws on non-200 (Plaid returns `error_code`).
- `api/src/plaid/scoring.ts` — pure `bankSafetyScore`, `behaviorScore`, `finalScore`, exported constants. No I/O.
- `api/src/plaid/items.ts` — `upsertPlaidItem` / `getPlaidItem` (encrypts/decrypts `access_token` via `crypto.ts`), mirroring `profiles.ts`.
- `api/src/routes/plaid.ts` — `POST /connect`, mounted at `/api/plaid` in `index.ts`.
- `api/src/routes/loans.ts` — MODIFIED `POST /` to enforce the gate.

## Secrets / config

`PLAID_CLIENT_ID`, `PLAID_SECRET` added to `Bindings` (`types.ts`), supplied via gitignored `.dev.vars` locally and `wrangler secret put` in prod (same pattern as `GEMINI_API_KEY`). Sandbox base URL `https://sandbox.plaid.com` is a module constant (env-switchable later for development/production Plaid environments).

## Error handling

| Condition | Response |
| :--- | :--- |
| Plaid API returns `error_code` / non-200 | 502 "bank audit failed" |
| Missing Plaid secrets | 500 config error |
| `POST /loans` with no connected bank | 428 "bank audit required" |
| KYC `rejected` | behavior = 0 → finalScore almost certainly < threshold → 403 |
| `finalScore < THRESHOLD` | 403 with `{ finalScore, breakdown }`, no loan row |

## Testing strategy

Matches the project pattern (real bindings via `@cloudflare/vitest-pool-workers`; outbound HTTP faked with the pool's undici `fetchMock`, never a `globalThis.fetch` spy).

- **`scoring.spec.ts`** — pure unit tests: a table of `(accounts/history) → expected sub-score & band`, including the overdrawn penalty, KYC-rejected → 0, default penalty, and the `finalScore` blend + threshold boundary.
- **`plaid.spec.ts`** — `POST /api/plaid/connect` with `fetchMock` faking the three `sandbox.plaid.com` calls: asserts a `plaid_items` row is written, **`access_token` column is ciphertext** (not `access-sandbox-…`), and `bank_safety_score` matches the scorer.
- **`loans.spec.ts`** (extended) — gate paths: no `plaid_items` → 428; seeded low-balance item + bad history → 403 with no loan row; healthy item → 201 with `risk_assessment_score` populated. Plaid faked via `fetchMock`; behavior seeded via DB rows.
- **Smoke test** (manual, `wrangler dev`, real sandbox creds): `POST /api/plaid/connect` against real `sandbox.plaid.com` → 200 with a bank-safety score; then `POST /api/loans` → 201 with a stored score. (Validated during design: the supplied sandbox creds complete create→exchange→balance successfully.)

## Out of scope / deferred

- **Real Plaid Link** (`link_token` create + frontend widget + `public_token` exchange from the client) — added when a frontend exists.
- **Transactions-based income/inflow signals** — `/transactions/get` `PRODUCT_NOT_READY` handling + recurring-deposit detection; v1 uses balances only.
- **Re-pull / webhooks / item refresh** — the connect-time snapshot is cached and reused.
- **Coverage-vs-requested-amount** at loan time — v1 uses the absolute-liquidity bank score; amount-aware coverage is a future enhancement.
- **Multiple banks per user** — one `plaid_items` row per user for now.
- **Lender side / P2P marketplace** — no lender role; borrower-only.
