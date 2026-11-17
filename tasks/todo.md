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
