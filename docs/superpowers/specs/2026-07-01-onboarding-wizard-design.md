# Onboarding Wizard & Access Gates Design

**Date:** 2026-07-01

## Summary

Post-registration onboarding wizard for borrowers (profile → bank → KYC), role-aware post-login routing, KYC gate on loan applications, Plaid button persistence fix, and expanded officer loan rows.

---

## 1. Post-Login Routing

After every login, App.tsx checks role and onboarding state:

| Role | onboarding_shown flag | Destination |
|------|----------------------|-------------|
| officer / admin | any | `/officer` |
| borrower | absent | `/onboarding` |
| borrower | present | `/dashboard` |

`onboarding_shown` is a `localStorage` key set to `'1'` when the wizard is completed or skipped past step 3. Officers never see the wizard.

---

## 2. Onboarding Wizard (`/onboarding`)

Three sequential steps. Step 1 is mandatory; steps 2 and 3 are skippable.

### Step 1 — Profile (required)

Fields (all required, no skip):
- First name
- Last name
- Phone
- Address
- National ID number

On "Continue": calls `PUT /api/profile`. On success, advances to Step 2. On API error, shows inline error. The "Continue" button is disabled until all 5 fields are non-empty.

### Step 2 — Connect Bank (optional)

Renders the existing Plaid link flow. On successful connection, advances to Step 3. "Skip for now" advances to Step 3 without connecting.

### Step 3 — Identity Verification (optional)

Renders the existing Didit KYC flow (consent checkbox → Start Verification). On session start or "Skip for now", sets `localStorage.onboarding_shown = '1'` and navigates to `/dashboard`.

---

## 3. Backend: `PUT /api/profile`

**Route:** `PUT /api/profile`  
**Auth:** `requireAuth` (any role)  
**Body:**
```json
{
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "address": "string",
  "nationalIdNumber": "string"
}
```
**Behaviour:** Upserts into `profiles` using `INSERT ... ON CONFLICT(user_id) DO UPDATE SET`. Encrypts all 5 fields with AES-GCM before storing (same `encryptField` used throughout). Returns `{ ok: true }`.  
**Validation:** All 5 fields must be non-empty strings; 400 otherwise.

---

## 4. Backend: `GET /api/profile/:userId`

**Route:** `GET /api/profile/:userId`  
**Auth:** `requireAuth` + `requireRole('officer', 'admin')`  
**Behaviour:** Returns decrypted profile for any user. Reuses existing `getProfile()`. 404 if no profile found.

---

## 5. Backend: KYC Gate on Loan Applications

In `POST /api/loans`, before the existing bank check:

```
if (kyc_status !== 'approved') → 403 { error: "KYC verification required before applying for a loan" }
```

Query: `SELECT kyc_status FROM profiles WHERE user_id = ?`. If no profile row or status is not `'approved'`, reject.

---

## 6. Dashboard Changes

### Plaid Button Persistence

`DashboardPage` fetches `GET /api/profile` on mount. Uses `bankConnected` from the response to initialise button visibility. Plaid button only renders when `!bankConnected`. This fixes the regression where the button reappeared on page refresh.

### KYC Notice on Loan Form

If `kycStatus !== 'approved'`, the loan form is replaced with a notice:

> "Complete identity verification to apply for a loan." [Go to KYC →]

The form is not rendered at all when KYC is not approved (no partial-disabled state).

---

## 7. Officer Page: Expanded Loan Rows

Each loan row in `OfficerPage` gets an expand toggle. When expanded:

**Borrower profile section** (fetched lazily on first expand via `GET /api/profile/:userId`):
- Full name, phone, address, national ID, KYC status

**Risk breakdown section** (parsed from `risk_assessment_summary` JSON already on the loan row):
- Final score, bank safety score, behaviour score, weights, threshold

Profile is fetched once per loan and cached in component state to avoid repeat requests.

---

## 8. Files Affected

| File | Change |
|------|--------|
| `api/src/routes/profile.ts` | Add `PUT /` and `GET /:userId` handlers |
| `api/src/profiles.ts` | Add `upsertProfile()` function |
| `api/src/routes/loans.ts` | Add KYC guard in `POST /` |
| `api/src/index.ts` | No change expected |
| `frontend/src/App.tsx` | Role-aware redirect after login |
| `frontend/src/pages/OnboardingPage.tsx` | New file — 3-step wizard |
| `frontend/src/pages/DashboardPage.tsx` | Profile fetch, Plaid persistence, KYC notice |
| `frontend/src/pages/OfficerPage.tsx` | Expandable rows with profile + risk |

No DB migration required. No new npm dependencies.
