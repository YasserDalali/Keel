# Backend refactor to DDD (`api/`)

**Goal:** same behaviour, same HTTP API, same DB schema; the business rules move out of route handlers into a domain layer that is pure, unit-testable and independent of D1, Hono and the payment/KYC vendors.
**Safety net:** the 166 existing API tests are HTTP-level (`app.request`), so they must stay green after every step. No migrations. No frontend changes.

## What the survey found
- `routes/loans.ts` (389 lines, 27 SQL statements) holds application, approval, rejection, cancellation, risk gating and repayment recording. Rules and SQL are interleaved.
- Routes import business logic from other routes (`payments.ts` and `demo.ts` import from `loans.ts`; `kyc.ts` imports from `webhooks.ts`), so there is no stable seam.
- `routes/auth.ts` registers users *and* builds the "account opened" PDF *and* sends the verification email.
- `schedule.ts` is a grab-bag (schedule loading, `targetUserId`, `cents`, date maths) used by history, reminders, transactions and loans.
- `profiles.ts` mixes personal details with KYC state. Loan status `defaulted` doubles as "declined" and "cancelled" (disambiguated by `approved_at` / `cancelled_at`), a legacy storage trick that leaks into every reader.
- Side effects (notify, email, PDFs) are called inline from the use-case code, in four places, with try/catch each time.

## Bounded contexts
| Context | Owns | Core? |
|---|---|---|
| **lending** | Loan aggregate (+ installments), application, approval/decline/cancel, risk gate, amortisation, repayment recording, overdue | **Core domain** |
| **payments** | Deposit and installment payments, gateways (Stripe, PayPal), transaction ledger, idempotency | supporting |
| **identity** | Users, credentials, roles, JWT, email verification, Google sign-in | supporting |
| **borrower** | Profile (PII, encrypted), identity verification (Didit), bank link (Plaid), bank safety score | supporting |
| **documents** | PDF rendering (agreements, receipts, statements), storage, listing | supporting |
| **communication** | Notifications (in-app), email templates/outbox/Resend, reminders | generic |
| **reporting** | Read models: schedule view, history, transactions listing | read-only |
| **shared kernel** | `Money`, `Clock`, `Id`, `Result`/domain errors, env/bindings, crypto, event bus type | |

`demo` stays outside the domain, as an interface-layer adapter that calls the same use cases.

## Layout (per context)
```
api/src/
  shared/                 kernel: money.ts, clock.ts, errors.ts, events.ts, crypto.ts, env.ts
  contexts/<name>/
    domain/               entities, value objects, policies, domain events, repository INTERFACES (pure TS, no D1/Hono/fetch)
    application/          use cases (one file per command/query), ports to vendors, event handlers
    infrastructure/       D1 repositories, Stripe/PayPal/Plaid/Didit/Resend adapters, R2 store
    interface/            Hono routes: parse + authorise -> call use case -> map to JSON (no SQL, no rules)
  app/                    composition root: builds use cases from `env` per request, wires the event bus, mounts routers
  index.ts                just exports the app + scheduled handler
```
Dependency rule: `domain` imports nothing; `application` imports domain + shared; `infrastructure` and `interface` import inward only. Contexts talk through **domain events** (in-process bus) or an application-level port, never by importing each other's infrastructure.

## Key domain modelling decisions
- **Loan aggregate** with a real `LoanStatus` (`pending | active | repaid | declined | cancelled | defaulted`). The repository maps it to/from the legacy columns (`defaulted` + `approved_at`/`cancelled_at`), so the DB does not change.
- Rules as methods: `loan.approve(by)` (needs paid deposit, creates schedule), `loan.decline(by)`, `loan.cancel()` (only pending, only before deposit), `loan.recordPayment(...)` (marks installment, closes the loan when the last is paid), deposit-required policy (> $5,000 -> 5%).
- `Money` value object (integer cents) replaces scattered `Math.round(x*100)/100`.
- `RiskAssessment` policy (bank safety + behaviour history, weights, threshold) lives in lending's domain, fed by a `BankSafetyReader` port from borrower.
- **Domain events:** `LoanApplied`, `LoanApproved`, `LoanDeclined`, `LoanCancelled`, `DepositPaid`, `InstallmentPaid`, `LoanRepaid`, `UserRegistered`. Handlers in documents (agreement/receipts PDFs) and communication (notifications + emails) replace today's inline calls. Handlers are idempotent and failures are logged, never fail the command.
- Repositories are interfaces in domain, D1 implementations in infrastructure; D1 `batch()` stays inside the repository so aggregates save atomically as they do now.

## Steps (each ends with `npx vitest run` green + typecheck no worse than today)
1. [ ] **Shared kernel + composition root.** Create `shared/`, `app/`; move env/crypto/types; `index.ts` mounts routers from the new composition root; nothing else moves yet.
2. [ ] **Lending** (core, done first and by hand): Loan aggregate, amortisation, risk policy, repositories, use cases (apply, approve, decline, cancel, record payment, get/list), events; thin routes; remove SQL/rules from `routes/loans.ts`.
3. [ ] **Payments**: gateway ports + Stripe/PayPal adapters, deposit and installment use cases, ledger repository; `payments.ts` becomes routes only.
4. [ ] **Communication + documents as event handlers**: notify/mail/PDF generation triggered by lending/payments events instead of inline calls.
5. [ ] **Identity** and **borrower** (profile, KYC, bank link) contexts.
6. [ ] **Reporting** read models (schedule, history, transactions, reminders); retire `schedule.ts`.
7. [ ] **Demo adapter** over the real use cases; delete dead files (`routes/*` logic remnants, old `notify.ts`, `profiles.ts`, `schedule.ts`).
8. [ ] **Domain unit tests** for the Loan aggregate, Money, risk policy and amortisation (pure, no DB); architecture test that fails if `domain/` imports from `infrastructure/`, `interface/`, `hono`, or `cloudflare:*`.
9. [ ] Update `.claude/CLAUDE.md` architecture section; deploy.

## Execution
Steps 1-2 by me (the foundation and the riskiest context), then steps 3-6 as parallel subagents with strict file ownership per context against the shared kernel, then 7-9 by me. Behaviour-preserving throughout; any bug found on the way is reported, not silently fixed.

## Out of scope
Changing API shapes, DB schema, auth flows, or frontend. No new libraries (no DI container, no ORM): plain constructor injection through the composition root.

---

# Keel phase 5 — statements, Stripe repayments, bank confirmation, notifications + confetti, mailer, email verification, Google sign-in, landing CTA

Four subagents in parallel. This section is the contract. Schema is already written and applied locally: `api/migrations/0008_auth_email.sql`, `0009_notifications_statements.sql` (read them). `api/src/mail/index.ts` is a stub with the final `sendTemplate` signature. New env fields are typed in `api/src/types.ts` (`APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL`, `MAIL_FROM`); local values for Stripe, Google and `APP_URL` are in `.dev.vars`/`.env` (never print or commit them).

## File ownership
- **A1 backend auth+mail:** `api/src/mail/**`, `api/src/routes/auth.ts`, `api/src/routes/demo.ts`, `api/src/env/binding-keys.ts`, `wrangler.toml`, new `api/src/auth/google.ts`, tests `api/test/{mail,verify-email,google-auth}.spec.ts` (+ demo.spec.ts additions).
- **A2 backend money+notify+PDF:** `api/src/routes/{loans,payments,documents}.ts`, new `api/src/routes/notifications.ts` + `api/src/notify.ts`, `api/src/documents/**`, `api/src/index.ts` (mount notifications only), tests `api/test/{notifications,stripe-installment,statements,documents}.spec.ts` + loans spec additions.
- **B1 frontend auth UI + landing CTA:** `frontend/src/auth/**`, `frontend/src/lib/auth.tsx`, `frontend/src/marketing/FinalCta.tsx`, new `frontend/src/app/EmailBanner.tsx`.
- **B2 frontend app UI:** new `frontend/src/app/Statements.tsx`, `frontend/src/app/Notifications.tsx`, `frontend/src/ui/Toast.tsx` (+ confetti), `frontend/src/app/Apply.tsx`, `frontend/src/app/LoanDetail.tsx`, `frontend/src/app/UpfrontDialog.tsx`, `frontend/src/app/Reminders.tsx`.
- **Integrator (main session):** `frontend/src/main.tsx`, `frontend/src/app/AppShell.tsx`, `/system`, migrations, `api/src/types.ts`. Report what you need there.

## Mail (A1 implements, A2 calls)
`sendTemplate(env, userId, to, template, data)` renders Keel-styled HTML + plain text, sends through the `EMAIL` (Cloudflare Email Service `send_email`) binding when `EMAIL` and `MAIL_FROM` are set, otherwise records status `logged`; always writes `email_outbox`; never throws. Templates and their data are listed in the stub. Links use `APP_URL`.

## API contract
**A1**
- `POST /api/auth/register` → also creates a `verify_email` token (24h, store SHA-256 only) and sends `verify_email` with `${APP_URL}/verify-email?token=…`. Response unchanged.
- `POST /api/auth/verify-email` `{ token }` → `{ ok: true }`; 400 invalid/expired/used.
- `POST /api/auth/resend-verification` (auth) → `{ ok: true }`; 429 if asked within 60 s (KV).
- `GET /api/auth/me` adds `emailVerified: boolean`.
- `GET /api/auth/google/start?next=/app` → 302 to Google (scope `openid email profile`, `state` in KV 10 min, `redirect_uri = ${APP_URL}/api/auth/google/callback`).
- `GET /api/auth/google/callback?code&state` → exchange code, read verified email, find user by `google_sub` then email (link it), else create a borrower (verified, unusable password hash); 302 to `${APP_URL}/auth/callback#token=<jwt>&next=<path>`; on failure 302 to `${APP_URL}/signin?error=google`. `next` must be a same-site path.
- Demo (DEMO_MODE only): `POST /api/demo/verify-email` (marks the caller verified); `GET /api/demo/outbox` → `{ emails: { id, template, subject, html, createdAt }[] }` for the caller, newest first.
- `wrangler.toml`: `APP_URL` var for production = `https://microloans-platform.yasser-dalali-personal.workers.dev`; optional `send_email` binding documented but only enabled if a sender domain exists (leave commented with instructions).

**A2**
- `POST /api/loans` → 403 `{ error, code: "email_unverified" }` when `users.email_verified_at` is null (check before KYC). On success notify staff + `loan_received` email.
- Notifications: `GET /api/notifications` → `{ notifications: { id, kind, title, body, link, readAt, createdAt }[], unread }` newest first (limit 50); `POST /api/notifications/read` `{ ids?: string[] }` (all when omitted).
  Events (put them inside the shared functions so demo paths fire too): application submitted → staff `loan_submitted`; deposit paid → staff `deposit_paid` + borrower `deposit_received` email; approved (`approveLoan`) → borrower `loan_approved` + email; declined → borrower `loan_declined` + email; cancelled → staff `loan_cancelled`; installment paid → borrower `payment_received` + `payment_receipt` email, staff `payment_received`.
- Stripe repayments: `POST /api/payments/stripe/installment-intent` `{ loanId, installmentId }` → `{ clientSecret, intentId, amount }` (amount = remaining on that installment; owner only); `POST /api/payments/stripe/installment-confirm` `{ loanId, installmentId, intentId }` → verifies the PaymentIntent succeeded and its metadata match, records the payment with method `stripe` through one shared `recordInstallmentPayment()` (also used by the existing pay route), returns `{ installmentId, status, documentId }`. Idempotent per intent.
- PDFs: redesign `api/src/documents/generator.ts` in Keel style (ink #14271F, accent #1F7A4D, mint #D8EFE2, canvas #F7F6F2 header band, Keel mark drawn as vector, clean tables, tabular amounts, footer with doc id + page). Add `deposit_receipt` (on deposit paid) and `statement`.
- `GET /api/documents` items add `title`, `loanId` (resolve receipts via installment), `amount` when known. `POST /api/documents/statement` `{ month?: "YYYY-MM" }` (default current month) → generates + saves a statement PDF (loans, payments in the month, balances) → `{ document }`.

## Frontend contract
**B1**: Google button on sign-in/sign-up (`href="/api/auth/google/start?next=/app"`), `/auth/callback` page (reads fragment token, `acceptToken`, navigates to `next`), `/verify-email` page, sign-in shows `?error=google`, after sign-up land in app with the email banner. `EmailBanner` (exported) for AppShell: shows when `!user.emailVerified`, Resend (handles 429), demo-only "Verify now" + "Open the email" (renders latest outbox email in a Dialog). Landing `FinalCta` redesigned to be far more attractive (Keel tokens and art, real copy, clear primary action).
**B2**: `/app/statements` (all PDFs grouped by year/type, open/download, generate a month's statement); Apply gets a "Confirm your bank" step showing `profile.bank` with a required confirmation and a Change link, plus `email_unverified` handling; `ToastProvider` + `useToast()` + confetti (no dependency, reduced motion = no confetti); celebrate once per approved loan (unread `loan_approved` notification, then mark read; also right after demo approve); one `NotificationBell` for both roles (server notifications + borrower reminders) replacing `ReminderBell`; LoanDetail "Pay by card" with Stripe for the next installment (demo pay stays as a Demo button).

---

# Keel phase 4 — schedule, reminders, transactions, borrowing progress, financial history, profile wizard

Three subagents in parallel. This section is their shared contract: build against these shapes even before the other side lands.

## File ownership (no agent edits another's files)
- **Backend:** `api/**`, `wrangler.toml`. Migrations start at `0007`.
- **Frontend features:** new `frontend/src/app/Schedule.tsx`, `History.tsx`, `Reminders.tsx`, `frontend/src/lib/history.ts` (+ test), new visuals in `frontend/src/app/charts.tsx`, and `frontend/src/app/Dashboard.tsx` (reminder banner + links).
- **Profile wizard:** `frontend/src/app/Setup.tsx`, new `frontend/src/app/Profile.tsx`, new `frontend/src/lib/profile.ts` if needed.
- **Integrator (main session):** `frontend/src/main.tsx` routes, `frontend/src/app/AppShell.tsx` nav, `/system`, shared `ui/*`, `lib/loans.ts`. Agents report what they need there instead of editing.

## API contract (all borrower-scoped to the signed-in user; staff may pass `?userId=`)
- `GET /api/schedule` → `{ installments: ScheduleItem[] }` sorted by dueDate.
  `ScheduleItem = { id, loanId, loanAmount, number, count, dueDate: "YYYY-MM-DD", amountDue, amountPaid, status: "paid"|"partial"|"unpaid"|"overdue", paidAt: string|null, onTime: boolean|null }`.
  `status` is `"overdue"` when not fully paid and dueDate < today (UTC), even before the cron marks it. `onTime` = paidAt date <= dueDate, null if unpaid.
- `GET /api/transactions?loanId=&type=&from=&to=` → `{ transactions: Txn[] }` newest first.
  `Txn = { id, loanId, installmentId: string|null, type: "disbursement"|"repayment"|"deposit"|"fee", amount, method: string, status: "pending"|"completed"|"failed", createdAt }`.
  Deposits are not rows in `transactions`; synthesize one per loan with `upfront_paid = 1` (id `deposit-<loanId>`, method from `upfront_payment_method`, createdAt = best available timestamp).
- `GET /api/reminders` → `{ reminders: Reminder[], settings: ReminderSettings }`.
  `Reminder = { installmentId, loanId, number, dueDate, amount, kind: "overdue"|"due_today"|"due_soon", daysUntil }` (negative when overdue); `due_soon` = within `settings.daysBefore` days. Empty when `settings.enabled` is false.
  `ReminderSettings = { enabled: boolean, daysBefore: number }` (1–14, default `{ enabled: true, daysBefore: 3 }`).
- `PUT /api/reminders/settings` body `ReminderSettings` → `{ settings }` (400 on bad input).
- `GET /api/history` → `{ summary, monthly, milestones }`.
  `summary = { borrowed, repaid, outstanding, loansActive, loansCompleted, paymentsMade, onTimeRate: number|null (0..1), onTimeStreak, memberSince }`.
  `monthly = { month: "YYYY-MM", due, repaid }[]` covering the borrower's first loan month through the last scheduled month.
  `milestones = { date, kind: "joined"|"applied"|"approved"|"first_payment"|"paid_off"|"cancelled"|"declined", text, loanId: string|null }[]` newest first.
- `GET /api/profile` (extended, existing fields unchanged) adds `bank: { institutionName: string|null, safetyScore: number, connectedAt: string|null } | null` and `kycUpdatedAt: string|null` (null if not tracked).
- Cron: daily `scheduled()` marks unpaid/partial installments past due as `overdue` (wrangler `[triggers] crons`). Tests must keep importing `app` the way they do now.

## Product rules
- Demo mode (`DEMO_MODE=true`): skipping the bank or ID step in the wizard fills them with demo data (`POST /api/demo/complete/bank|identity`), so the profile always ends complete in demos. Skipping details in demo fills `demoProfile()`.
- After the wizard, details, bank and ID live on `/app/profile` (view + edit details, reconnect bank, re-verify ID).
- Keel rules apply: tokens only, no pills/badges, tabular money, plain words, 44px targets, reduced motion, text equivalent for every chart.

---

# Keel phase 3 — cancel, validation popups, demo approve, a fuller app

## Asks
1. Borrower can cancel a loan that is still waiting for approval.
2. Validation shown as popups next to the field (not the browser's grey bubble).
3. Demo button that approves the borrower's own pending loan.
4. The app looks bland and empty: make it more useful.

## Design (UX heuristics + art direction)
- Problem: pages are one headline and a hairline table. No overview, no history, no picture of the schedule, no art.
- Direction stays "Warm Editorial": canvas, ink, accent. Add the delivered illustrations (tile-*.webp on mint-50) to empty states and section anchors, so pages feel inhabited.
- Dashboard: stat strip (borrowed, still owed, repaid, payments left), a 12-cell payment strip (paid / next / due / overdue) as the signature visual, an "Upcoming" list of the next 3 payments, an activity feed (applied, approved, paid, documents), quick-apply amount presets.
- Loan detail: lifecycle stepper (Applied, Deposit, Approved, Repaying, Paid off) with dates; balance left, payoff date; payment strip above the table; Cancel action while pending.
- Queue: summary strip (waiting, amount requested, average risk, oldest wait) and an inline mini risk bar per row.
- Every new visual has a text equivalent; reduced motion keeps the static layout.

## API
- `POST /api/loans/:id/cancel` (owner, status pending, deposit not paid) → status `defaulted` + new `cancelled_at`. Migration 0006 adds the column.
- Behaviour score counts `defaulted` only when the loan was approved (cancelled and declined applications are not defaults).
- `POST /api/demo/approve/:id` (DEMO_MODE only, owner): marks any required deposit paid, then runs the same approval as officers (shared function).

## Steps
- [x] 1. API: migration, cancel, shared approve, demo approve, scoring guard, tests first
- [x] 2. TextField validation popups (+ patterns on profile fields)
- [x] 3. Shared visuals: PaymentStrip, StatStrip, Activity
- [x] 4. Dashboard, Loan detail (stepper, cancel, demo approve), Queue summary
- [x] 5. Verify: API + frontend tests, build, browser 1440/375

---

# Keel phase 2 — the working app in the Keel system

Phase 1 plan archived at `tasks/keel-phase1-plan.md`. Spec: `tasks/keel-design-spec.md` (tokens, primitives, rules carry over unchanged).

**Goal:** replace the bare `/app` with the functional app the old frontend had (onboarding, KYC, borrower dashboard, officer queue, upfront payment) plus what the API supports but the old UI never showed (loan detail with schedule, installment payment, documents), all in Keel.

## Art direction for the app side
- Same tokens, calmer motion. The landing page performs; the app reports. One signature moment: the borrower's **next payment** set at display size in tabular figures, with a repaid-progress rule under it.
- Tables are type, not boxes: hairline `line` rows, label-size column heads, tabular money right-aligned.
- Status = dot + word (no pills, no badges — spec §1). Colour only from accent / warning / danger / ink-3.
- Motion: page content rises 16px + fades, 60ms stagger, 400ms expo-out. Numbers tick (reuse `Ticker`). Reduced motion: static.

## UX rules applied (Nielsen / Krug)
- Trunk test: persistent app bar, current section marked with `aria-current`, page `<h1>` matches the link.
- Visibility of status: skeletons while loading, "Saving…" on buttons, live region for results, verification status always visible.
- Error recovery: every API error rendered as plain sentence + next step; inputs keep their values.
- Recognition over recall: readiness checklist on the dashboard says exactly what is missing and links to it.
- Error prevention: Apply disabled with the reason when KYC/bank missing; Reject asks for confirmation; Approve disabled with reason while an upfront deposit is unpaid.

## Routes
| Path | Who | Content |
|---|---|---|
| `/app` | all | redirect: officer/admin → `/app/queue`, borrower → `/app/loans` |
| `/app/loans` | borrower | next-payment hero (if active loan), readiness checklist, loans list, Apply CTA |
| `/app/apply` | borrower | sliders + live quote (reuse Calculator parts), submit → loan detail |
| `/app/loans/:id` | both | summary, status, upfront deposit panel, installment schedule with Pay, documents |
| `/app/setup` | borrower | 3-step wizard `?step=profile|bank|identity`, each step shows its done state |
| `/app/queue` | officer | status tabs with counts, loan rows expand to borrower profile + risk bar vs threshold, Approve / Reject |

## Files
- `ui/AppShell.tsx` — app bar (wordmark, role nav, email, sign out), `<Outlet/>`.
- `ui/Status.tsx`, `ui/Dialog.tsx` (native `<dialog>`), `ui/Checkbox.tsx`, `ui/Skeleton.tsx` — added to `/system`.
- `ui/Slider.tsx`, `ui/Ticker.tsx` — lifted out of `marketing/Calculator.tsx` (Calculator imports them).
- `lib/loans.ts` (+ `.test.ts`) — domain types missing from openapi, status labels, `progress()`, `nextInstallment()`, `readiness()`, `http()` helper for non-openapi endpoints.
- `app/Dashboard.tsx`, `app/Apply.tsx`, `app/LoanDetail.tsx`, `app/UpfrontDialog.tsx` (lazy), `app/Setup.tsx`, `app/Queue.tsx`, `app/Plaid.tsx`.
- Delete `app/AppHome.tsx`.
- Deps re-added (same as old frontend): `@didit-protocol/sdk-web`, `react-plaid-link`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `@paypal/react-paypal-js`. Payment SDKs load only inside the lazy dialog.

## Steps
- [x] 1. Deps, `lib/loans.ts` + test (TDD), lift Slider/Ticker
- [x] 2. Primitives + `/system` entries, AppShell, routes
- [x] 3. Dashboard + Apply
- [x] 4. Loan detail + upfront dialog + installment pay + documents
- [x] 5. Setup wizard (profile, Plaid, Didit)
- [x] 6. Officer queue
- [x] 7. Verify: typecheck, `npm test`, browser at 1440 and 375, reduced motion

`api/` is not modified.
