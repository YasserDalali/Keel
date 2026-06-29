# Frontend Pages

React SPA (Vite + React Router). All API calls go through `src/lib/api.ts` (openapi-fetch client, auto-attaches JWT from localStorage). Auth state lives in `App.tsx` via `AuthContext`.

---

## Route map

| Path | Component | Auth | Role |
|---|---|---|---|
| `/` | redirect | — | → `/dashboard` or `/login` |
| `/login` | `LoginPage` | public | — |
| `/kyc` | `KycPage` | required | any |
| `/dashboard` | `DashboardPage` | required | any |
| `/officer` | `OfficerPage` | required | `officer` / `admin` |

---

## Pages

### `/login` — LoginPage

Single form with a **login / register toggle**.

- **Login mode**: `POST /auth/login` → stores JWT in localStorage → redirects to `/dashboard`.
- **Register mode**: `POST /auth/register` (creates account) → immediately logs in → same redirect.
- Turnstile token is currently hardcoded to the always-pass test value (`1x00...AA`).
- No nav bar shown (Nav hides itself when `user` is null).

---

### `/kyc` — KycPage

Two-step identity verification flow.

**Step 1 — Upload:**
- File input (JPEG/PNG). Submits to `POST /api/kyc/upload` via raw `fetch` (multipart).
- Backend runs Gemini OCR and returns `OcrSuggestions` (`firstName`, `lastName`, `nationalIdNumber`).

**Step 2 — Confirm:**
- Pre-fills extracted fields. User reviews and fills in remaining required fields (`phone`, `address`).
- Submits to `POST /kyc/confirm` → on success, navigates to `/dashboard`.
- Back button returns to step 1.

---

### `/dashboard` — DashboardPage

Borrower home screen. Three sections:

**1. Loans list**
- Fetches `GET /loans` on mount.
- Each loan row shows: truncated ID, amount, term, status, date.
- If loan has `upfront_required = 1` and `upfront_paid = 0`, shows **"Pay upfront $X"** button → opens `UpfrontPaymentModal`.

**2. Bank connect (Plaid)**
- Shows `PlaidLinkButton` until a score is returned.
- Button fetches a link token (`POST /plaid/link-token`), opens Plaid Link, then exchanges the public token (`POST /plaid/connect`) → displays `bankSafetyScore`.

**3. Loan application form**
- Inputs: amount (number), term in months (number).
- Submits `POST /loans` → refreshes loan list on success.

---

### `/officer` — OfficerPage

Loan review queue. Visible only to `officer` and `admin` roles (enforced by `ProtectedRoute` and Nav link visibility).

- Fetches `GET /loans?status=pending` on mount.
- Each row shows: truncated ID, amount, term, risk score (if present), date.
- **Approve** → `POST /loans/{id}/approve`
- **Reject** → `POST /loans/{id}/reject`
- List refreshes after each action.

---

## Shared components

### `Nav`
Top bar shown on every authenticated page. Links: Dashboard, KYC, Officer Panel (officer/admin only), user email, Logout button. Hidden when `user` is null (i.e. on `/login`).

### `ProtectedRoute`
Wraps authenticated routes. Redirects to `/login` if no user. Accepts optional `roles` prop — redirects to `/dashboard` if user's role isn't in the list.

### `UpfrontPaymentModal`
Full-screen overlay with a **Stripe / PayPal tab switcher**.

- Fetches `/api/config` on open to get `stripePublishableKey` and `paypalClientId`.
- **Stripe tab**: Stripe Elements `CardElement` → `POST /payments/stripe/intent` → `confirmCardPayment` → `POST /payments/stripe/confirm`.
- **PayPal tab**: PayPal Buttons → `POST /payments/paypal/order` (creates order) → `POST /payments/paypal/capture` (on approval).
- Calls `onPaid()` on success; `onClose()` on dismiss.

---

## Auth flow summary

```
localStorage["token"] present?
  └─ yes → GET /auth/me → populate AuthContext.user
  └─ no  → user = null

ProtectedRoute checks AuthContext.user:
  null      → redirect /login
  wrong role → redirect /dashboard
  ok        → render children
```
