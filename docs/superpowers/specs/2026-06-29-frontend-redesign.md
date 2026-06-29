# Frontend Redesign — Onboarding Wizard, Credit, Documents, Officer Panel

**Date:** 2026-06-29
**Scope:** Frontend-only restructure + 2 new backend endpoints. Approach A (thin layer).

---

## Route Map

| Path | Page | Auth | Role |
|---|---|---|---|
| `/` | redirect | — | → `/dashboard` or `/login` |
| `/login` | LoginPage | public | — |
| `/onboarding` | OnboardingWizard | required | any |
| `/kyc` | KycPage | required | any (re-verify) |
| `/dashboard` | DashboardPage | required | any |
| `/credit` | CreditPage | required | any |
| `/documents` | DocumentsPage | required | any |
| `/officer` | OfficerPage | required | officer / admin |

---

## 1. Auth & Navigation

### Redirect logic (`ProtectedRoute`)

After login, `ProtectedRoute` checks if onboarding is complete before rendering the requested route.

Onboarding is considered complete when `profile.kycStatus !== null` OR `profile.bankConnected === true`. The flag is derived from `GET /profile` which already returns `kycStatus`, `bankConnected`, and `bankSafetyScore`. No backend changes needed for this check.

- Not complete → redirect to `/onboarding`.
- Complete → render the requested route.
- Visiting `/onboarding` while complete → redirect to `/dashboard`.

### Nav changes

Add links: `Credit Score` → `/credit`, `Documents` → `/documents`. Keep `KYC` link. `Officer Panel` stays role-gated. All links hidden when `user` is null (existing behavior).

---

## 2. Onboarding Wizard (`/onboarding`)

New file: `src/pages/OnboardingWizard.tsx`

Linear, two steps with a progress bar (`Step 1 of 2`, `Step 2 of 2`). Each step has a **Skip** button.

### Step 1 — KYC

Embeds the existing KYC flow inline (upload → OCR → confirm form). On complete: advance to Step 2. On skip: advance to Step 2 with `kycSkipped` local state set.

The existing `KycPage` should be refactored to export a `KycFlow` component (the inner logic without the page wrapper) so both `/kyc` and `/onboarding` can reuse it without duplication.

### Step 2 — Bank Connect

Plaid Link button (lifted from current `DashboardPage`). On success: stores score in `AuthContext` (or re-fetches `/auth/me`). On skip: advance to Done screen.

### Done screen

Summary of what was completed/skipped. "Go to Dashboard" button navigates to `/dashboard`.

No "complete onboarding" API call needed — completion is derived from server state on next `/auth/me` fetch.

---

## 3. Dashboard Refactor (`/dashboard`)

File: `src/pages/DashboardPage.tsx` (modified)

### Changes

1. **Remove `PlaidLinkButton`** — bank connect moves to `/credit`. Dashboard shows `bankSafetyScore` passively as text if already connected (fetched from `/auth/me` or stored in context).

2. **Loan application gate:** `DashboardPage` fetches `GET /profile` on mount (alongside `GET /loans`). Before submitting the apply form, check:
   - `profile.kycStatus !== 'verified'` → disable submit, show inline message: `"KYC required — complete verification"` linking to `/kyc`.
   - `profile.bankConnected === false` → disable submit, show inline message: `"Bank connection required — connect your bank"` linking to `/credit`.
   - Both checks must pass for the button to be enabled.

3. **Loan cards:** Each card retains its current fields. If `upfront_required === 1` and `upfront_paid === 0` → amber "Pay upfront $X" button opens existing `UpfrontPaymentModal`. No changes to the modal.

---

## 4. Credit Page (`/credit`)

New file: `src/pages/CreditPage.tsx`

### Sections

**Score display**
- If Plaid connected: show `bankSafetyScore` as a number (and optionally a colored gauge — green ≥ 0.7, amber 0.4–0.69, red < 0.4).
- If not connected: "No bank connected" message + Plaid Link button (the `PlaidLinkButton` component lifted from `DashboardPage`).

**Plaid account summary**
- Institution name, account type, average balance, transaction volume — whatever fields the `/plaid/connect` response currently returns.
- "Reconnect bank" button re-runs Plaid Link, refreshes score.

**Score explainer**
- Static section: bullet list explaining what factors affect the score (balance stability, transaction regularity, account age). Copy can be hardcoded.

---

## 5. Documents Page (`/documents`)

New file: `src/pages/DocumentsPage.tsx`

Single table, newest-first. Columns: **Date**, **Type**, **Description**, **Download**.

### Event types

| Type | Has PDF | Description example |
|---|---|---|
| `account_opened` | yes | Account opened |
| `kyc_submitted` | no | Identity verification submitted |
| `loan_applied` | no | Loan application — $1,000 / 12 mo |
| `loan_approved` | yes | Loan agreement — $1,000 approved |
| `loan_rejected` | no | Loan rejected |
| `payment_made` | yes | Payment receipt — $91.67 installment 2/12 |
| `loan_fully_paid` | no | Loan fully repaid |

PDF rows render a Download link. Non-PDF rows show `—` in the Download column.

### New backend endpoint required

`GET /documents` — returns the user's audit log from the `audit_logs` table, with a `pdf_r2_key` field where applicable. Existing audit log inserts should already populate this table; the endpoint just needs to expose it with a signed R2 URL or a `/documents/:id/download` redirect.

---

## 6. Officer Panel Refactor (`/officer`)

File: `src/pages/OfficerPage.tsx` (modified)

Stays one page. Loan rows become expandable on click.

### Collapsed row (unchanged)
Loan ID (truncated), amount, term, risk score, date, Approve / Reject buttons.

### Expanded panel (new)

Lazy-loaded on first expand via `GET /users/:userId/profile` (officer-only endpoint).

Three sub-sections:

1. **Borrower identity** — name, national ID, phone, address (decrypted server-side for officer role), KYC status.
2. **Credit** — `bankSafetyScore`, Plaid account summary (institution, type, avg balance).
3. **Loan history** — table of all this borrower's past loans: amount, term, status, created date.

Approve/Reject buttons visible in both collapsed and expanded states.

### New backend endpoint required

`GET /users/:userId/profile` — officer/admin only. Returns decrypted PII from `profiles`, Plaid score, and loan history for the given user.

---

## 7. Shared Components

### `KycFlow` (refactor of `KycPage`)

Extract inner logic from `KycPage` into `src/components/KycFlow.tsx`. `KycPage` becomes a thin wrapper. `OnboardingWizard` imports `KycFlow` directly.

### `PlaidLinkButton`

Lift from `DashboardPage` into `src/components/PlaidLinkButton.tsx`. Used in `OnboardingWizard` (Step 2) and `CreditPage`.

### `AuditTable` (optional)

If the officer expanded panel shows a loan history table and `DocumentsPage` shows a similar table, extract a shared `src/components/AuditTable.tsx`. Only worth it if the column structure is genuinely shared — defer this to implementation.

---

## 8. New Files Summary

| File | Type |
|---|---|
| `src/pages/OnboardingWizard.tsx` | new |
| `src/pages/CreditPage.tsx` | new |
| `src/pages/DocumentsPage.tsx` | new |
| `src/components/KycFlow.tsx` | refactor (extracted from KycPage) |
| `src/components/PlaidLinkButton.tsx` | refactor (extracted from DashboardPage) |

Modified: `App.tsx`, `ProtectedRoute.tsx`, `DashboardPage.tsx`, `OfficerPage.tsx`, `Nav.tsx`, `KycPage.tsx`

---

## 9. Backend Requirements

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `GET /documents` | GET | any | Borrower audit log with PDF keys |
| `GET /users/:userId/profile` | GET | officer/admin | Decrypted PII + Plaid + loan history |

`GET /profile` already returns `kycStatus`, `bankConnected`, `bankSafetyScore` — no changes needed for onboarding completion check.

---

## Out of Scope

- Mobile-responsive design (not discussed).
- Pagination on audit log or officer queue (add when lists grow).
- Notification system (not discussed).
- Installment schedule view (no `/loans/:id` page in this spec).
