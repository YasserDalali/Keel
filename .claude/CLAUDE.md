# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TIER 1 — HARD RULES (check before every action)
- Never commit secrets.
- Never claim what unread code does — open and read files first.
- Before touching a file: is the task unambiguous AND trivial (<3 steps, 1 file)?
  If not → plan first.

## TIER 2 — WORKFLOW
- Plan mode for any non-trivial task (3+ steps or an architectural call).
- Write the plan to tasks/todo.md; check in before implementing.
- Use /ponytail during implementation and TDD.
- Use subagents liberally to keep the main context clean.

## TIER 3 — PROJECT FACTS

### Commands

```bash
# Run all tests (from repo root)
npm test

# Run all tests (from api/)
cd api && npx vitest run

# Run a single test file
cd api && npx vitest run test/loans.spec.ts

# Run a single test by name
cd api && npx vitest run -t "test name substring"

# Local dev server
npm run dev          # wrangler dev

# Deploy
npm run deploy       # builds frontend then wrangler deploy

# Apply DB migrations (remote)
wrangler d1 migrations apply microloans_db
```

### Architecture

**Single Cloudflare Worker** (`api/src/index.ts`) serving a Hono router. No separate services. The Keel frontend (`frontend/`) is built to static assets and served by the same Worker (`[assets]` in `wrangler.toml`, SPA fallback; `/api`, `/docs`, `/openapi.json` go to Hono).

**Frontend (Keel)** — `frontend/`: Vite 8 + React 19 + Tailwind v4 (tokens in `src/styles/tokens.css` `@theme`) + GSAP (ScrollTrigger, SplitText) + Lenis, all in `src/lib/motion.ts`. Primitives in `src/ui/`, landing sections in `src/marketing/`, auth in `src/auth/` + `src/lib/auth.tsx`. `/system` renders every token and primitive — add new ones there. Illustrations are WebP in `public/img/`; white/cream-backed art uses `mix-blend-multiply` (`Art blend`). Every animation has a `prefers-reduced-motion` path. Loan maths mirror the API in `src/lib/loan-terms.ts` (keep in sync with `LOAN_*` vars). Dev: `npm run dev` (worker :8787) + `npm run frontend:dev` (:5173, proxies `/api`); `window.__lenis` is exposed in dev for scripted scrolling.

**Bindings** (declared in `wrangler.toml`, typed in `api/src/types.ts`):
- `DB` — D1 (SQLite), migrations in `api/migrations/`. `LOAN_CACHE` — KV (token blacklist, OAuth state, resend throttle). `DOCS_BUCKET` — R2 (PDFs). `ASSETS` — the built frontend.
- Secrets (`.dev.vars` locally): `JWT_SECRET`, `TURNSTILE_SECRET`, `PII_ENCRYPTION_KEY`, `DIDIT_*`, `PLAID_*`, `PAYPAL_*`, `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`. Vars: `DEMO_MODE`, `APP_URL`, `MAIL_FROM`, `LOAN_*`, `RISK_SCORE_THRESHOLD`.

### Backend architecture (Domain-Driven Design, after Evans)

`api/src/` is `contexts/` (the business), `shared/` (shared kernel), `app/` (composition root and platform), `middleware/`, `index.ts` (mounts routers, exports the Worker).

**Bounded contexts** (`contexts/<name>/`): `lending` (core: Loan aggregate with Installment entities, approval/decline/cancel, deposit and risk policies, repayment schedule), `payments` (ledger, Stripe/PayPal gateways, repayment coordination), `identity` (User aggregate, email verification, Google sign-in, JWT), `borrower` (Profile aggregate with encrypted PII and KYC lifecycle, bank link, Didit and Plaid), `documents` (PDF rendering, storage, statements), `communication` (notifications, email outbox and templates, Resend), `reporting` (read models: schedule, history, transactions, reminders).

**Layers inside each context**, dependencies point inward only:
- `domain/` — entities, value objects, domain services, events, repository *interfaces*, `DomainError` subclasses. Pure TypeScript: no D1, Hono, fetch, or other contexts.
- `application/` — one class per use case (load aggregate, call its method, save, publish events) and the ports it needs from the outside.
- `infrastructure/` — D1 repositories, provider adapters (anti-corruption layers: provider JSON never leaves them), R2, Resend.
- `interface/` — Hono routers: parse, authorise, call a use case, map `DomainError.code` to a status via `app/http.ts` (`problem()`). No SQL, no rules.

**Rules of thumb**
- Business rules are methods on aggregates (`loan.approve(...)`, `loan.cancel(...)`), not `if`s in routes or use cases. Aggregates reference others by id only; one repository per aggregate root.
- Contexts talk through **domain events** on `shared/events.ts` `EventBus` (`lending.loan-approved` → payments ledger, documents PDF, communication email). Handlers run after the save, are isolated (a failing one is logged, never fails the command) and must be idempotent, so cross-context effects are eventually consistent.
- Where one context needs facts from another it declares a port in its own words (e.g. lending's `ApplicantGateway`) and `app/wiring/*.ts` adapts the other context's use cases to it.
- `shared/` is deliberately tiny: `Money` (whole cents), `Clock`, `IdGenerator`, `DomainError`, `EventBus`, `crypto`, and the one overdue rule shared by lending and reporting.
- `app/container.ts` is the only place that builds concrete classes (`app/wiring/<context>.ts` per context, cached per env); routes get use cases from `c.var.services`. `app/demo-routes.ts` is an adapter over the same use cases (only when `DEMO_MODE=true`).
- The loans table predates the model: its `defaulted` status stores declined, cancelled and defaulted (told apart by `approved_at`/`cancelled_at`). Only `lending/infrastructure/d1-loan-repository.ts` knows; the API still reports `"defaulted"` for declined/cancelled for compatibility.

**Adding a feature**: put the rule on the aggregate (with a pure test in `test/lending-domain.spec.ts` style), add a use case, expose it through the context's router, wire it in `app/wiring/`. If another context must react, raise an event rather than calling it.

**Auth middleware** (`api/src/middleware/`): `requireAuth` (HS256 JWT, sets `c.var.userId/role/jti/exp`), `requireRole(...)`, `turnstile.ts` (fail-closed).

### Testing

Tests run inside `@cloudflare/vitest-pool-workers` (real miniflare runtime, not mocks). Key seams:

- `fetchMock` from `cloudflare:test` (not `jest.spyOn(globalThis, 'fetch')`) — required for intercepting outbound fetch in the Workers runtime.
- R2 assertions use `.head(key)` not `.get(key)` — `.get()` returns `null` for empty bodies in some miniflare versions.
- `TURNSTILE_SECRET` is pinned to `1x0000000000000000000000000000000AA` (Cloudflare always-pass test secret) via `vitest.config.ts` miniflare bindings — tests don't need a real token.
- `TEST_MIGRATIONS` binding is injected by `vitest.config.ts`; `test/apply-migrations.ts` applies them once as a global setup file. `RESEND_API_KEY` is pinned empty so tests never send mail.
- Domain rules have pure tests (`lending-domain.spec.ts`, `reporting-domain.spec.ts`: no DB). `test/architecture.spec.ts` fails if the dependency rule is broken (domain importing hono/D1/infrastructure, a context reaching into another's infrastructure, SQL in a router). `test/support/fixtures.ts` seeds profiles and bank links through the real repositories.

### Specs & plans

- `tasks/keel-design-spec.md` — Keel design system + landing/auth spec (source of truth for tokens, copy, motion).
- `tasks/todo.md` — current implementation plan. `tasks/gemini-prompts.md` — prompts that produced the illustrations.
- `CLOUDFLARE_MICROLOAN_PLAN.md` — original architectural blueprint.
