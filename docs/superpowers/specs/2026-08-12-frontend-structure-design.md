# Frontend Structure — Full Product Surface

**Date:** 2026-08-12
**Scope:** Site hierarchy, page inventory, and component breakdown for a modernized microloans frontend. Structure only — no visual design system or code specified here; hand this to a UI generator (v0) to design and build.

**Existing stack (keep compatible):** React 18 + TypeScript, `react-router-dom`, Tailwind CSS, a generated OpenAPI client (`src/lib/api.ts` / `api-types.ts`). Three user roles: `borrower`, `officer`, `admin`.

---

## 1. Site Hierarchy

```
/login                          (public)
/onboarding                     (borrower, first login only)
/dashboard                      (borrower)
  /loans/:id                    (borrower, own loan)
/profile                        (any authenticated role)
/kyc                            (any — launched from onboarding or Profile, not a nav link)
/documents                      (borrower)
/notifications                  (any)
/officer                        (officer, admin)
/admin                          (admin) → redirects to /admin/users
  /admin/users
  /admin/audit
  /admin/portfolio
  /admin/settings
```

## 2. Route Map

| Path | Page | Auth | Role |
|---|---|---|---|
| `/login` | LoginPage | public | — |
| `/onboarding` | OnboardingPage | required | any (first login only) |
| `/dashboard` | DashboardPage | required | borrower |
| `/loans/:id` | LoanDetailPage | required | borrower (own loan) |
| `/profile` | ProfilePage | required | any |
| `/kyc` | KycPage | required | any |
| `/documents` | DocumentsPage | required | borrower |
| `/notifications` | NotificationsPage | required | any |
| `/officer` | OfficerPage | required | officer, admin |
| `/admin/users` | AdminUsersPage | required | admin |
| `/admin/audit` | AdminAuditPage | required | admin |
| `/admin/portfolio` | AdminPortfolioPage | required | admin |
| `/admin/settings` | AdminSettingsPage | required | admin |

Unauthenticated visits to any protected route redirect to `/login`. Wrong-role visits (e.g. borrower hitting `/officer`) redirect to `/dashboard` (or `/officer` for an officer hitting `/admin/*`).

---

## 3. Global Navigation

**`Nav`** (top bar, hidden when logged out):
- Logo/home → role-aware home (`/dashboard` for borrower, `/officer` for officer, `/admin/users` for admin)
- **Dashboard** (borrower only)
- **Documents** (borrower only)
- **Officer Panel** (officer, admin)
- **Admin** (admin only) — dropdown or sub-nav to Users / Audit / Portfolio / Settings
- **Notification bell** (any) — icon with unread-count badge, opens a small dropdown of the 5 most recent items, "View all" → `/notifications`
- **Profile** (any) — avatar/initials, opens `/profile`
- **Logout**

No direct "KYC" nav link — verification is reached through Profile or is force-routed during onboarding.

---

## 4. Borrower Pages

### 4.1 LoginPage
*Unchanged.* Email/password form, Turnstile widget, link to register.

**Components:** `LoginForm`

### 4.2 OnboardingPage
*Unchanged (already implemented as a 3-step wizard).* Step 1 profile (required), Step 2 bank connect (skippable), Step 3 KYC (skippable).

**Components:** `OnboardingStepper`, `ProfileForm`, `PlaidLinkButton`, `KycConsentStep`

### 4.3 DashboardPage
**Purpose:** Home base — see all loans, apply for a new one.

**Sections:**
- Loan list: cards/rows showing id, amount, term, status, created date; click-through to `/loans/:id`
- Apply form: amount + term inputs, gated on KYC-approved + bank-connected (inline messages with links to `/profile` when blocked)
- Passive display of bank safety score if connected

**Components:** `LoanCard` (or `LoanRow`), `LoanApplyForm`, `EligibilityNotice`

**Data:** `GET /loans`, `GET /profile`, `POST /loans`

### 4.4 LoanDetailPage (new)
**Purpose:** Drill into a single loan.

**Sections:**
- Loan summary header: amount, term, status, rate, created/approved dates
- Installment schedule table: due date, amount, status (paid/unpaid/overdue), "Pay" action per row
- Payment history: past payments made, with receipt links (ties into Documents)

**Components:** `LoanSummaryHeader`, `InstallmentTable`, `PaymentModal` (generalized — same modal used for upfront payment and per-installment payment)

**Data:** `GET /loans/:id`, `POST /loans/:id/installments/:installmentId/pay`

### 4.5 ProfilePage (new)
**Purpose:** Single hub for account info, replacing the scattered KYC/bank UI.

**Sections:**
- Profile fields: first/last name, phone, address, national ID — editable form
- Verification status: current `kycStatus` badge, "Re-verify" button → `/kyc`
- Bank connection: connected institution + safety score, "Connect"/"Reconnect" via `PlaidLinkButton`
- Account security: change password, active sessions *(flagged — no backend endpoints exist yet)*

**Components:** `ProfileForm`, `KycStatusBadge`, `PlaidLinkButton`, `SecurityPanel` *(stub until backend exists)*

**Data:** `GET /profile`, `PUT /profile`

### 4.6 KycPage
*Unchanged.* Upload ID → OCR review/confirm → Didit liveness flow. Reached from Onboarding or Profile, not from top nav.

**Components:** `KycUploadForm`, `OcrReviewForm`, `DiditVerificationStep`

### 4.7 DocumentsPage (new)
**Purpose:** Borrower's own paper trail.

**Sections:** Single table, newest-first — Date, Type, Description, Download. Types: account opened, KYC submitted, loan applied, loan approved, loan rejected, payment made, loan fully paid. PDF-backed rows get a download link; others show `—`.

**Components:** `DataTable` (generic, reused elsewhere)

**Data:** `GET /documents` *(backend gap — not built yet, see §7)*

### 4.8 NotificationsPage (new)
**Purpose:** Full history behind the nav bell.

**Sections:** Chronological list of events (loan status changes, payment due/overdue, KYC status changes), read/unread state, mark-all-read action.

**Components:** `NotificationList`, `NotificationBell` (shared with Nav)

**Data:** *(backend gap — no notification storage/delivery exists yet, see §7)*

---

## 5. Officer Pages

### 5.1 OfficerPage
*Unchanged (already implemented).* Loan review queue, expandable rows showing borrower profile + risk breakdown, Approve/Reject actions.

**Components:** `LoanQueueRow`, `BorrowerProfilePanel`, `RiskBreakdownPanel`

**Data:** `GET /loans`, `GET /profile/:userId`, `POST /loans/:id/approve`, `POST /loans/:id/reject`

---

## 6. Admin Section (new)

Own nav entry, four sub-pages, admin-only.

### 6.1 AdminUsersPage
**Purpose:** User management.

**Sections:** Searchable/filterable user table (email, role, KYC status, created date), row actions: change role, deactivate account.

**Components:** `DataTable`, `RoleSelect`, `ConfirmDialog`

**Data:** *(backend gap — no user-list/role-change/deactivate endpoints yet)*

### 6.2 AdminAuditPage
**Purpose:** System-wide audit trail (vs. Documents, which is scoped to one borrower).

**Sections:** Filterable table across all users — actor, action, target, timestamp.

**Components:** `DataTable`, `AuditFilterBar`

**Data:** *(backend gap — needs an admin-scoped, unfiltered audit_logs endpoint)*

### 6.3 AdminPortfolioPage
**Purpose:** Org-wide reporting.

**Sections:** Stat cards (total disbursed, active loans, repayment rate, default rate), status-breakdown chart, officer activity table (loans reviewed, approve/reject ratio).

**Components:** `StatCard`, `StatusBreakdownChart`, `OfficerActivityTable`

**Data:** *(backend gap — needs an aggregate-stats endpoint)*

### 6.4 AdminSettingsPage
**Purpose:** System configuration currently hardcoded in the Worker (e.g. the 5% flat interest rate, risk-score thresholds, KYC requirements).

**Sections:** Editable form per config value, with current/default shown.

**Components:** `ConfigForm`

**Data:** *(backend gap — no config storage exists; these values are literals in the Worker code today)*

---

## 7. Backend Gaps (frontend can stub/mock these; not building them here)

| Need | Used by | Status |
|---|---|---|
| `GET /documents` | DocumentsPage | not built |
| Notification storage + delivery (in-app minimum; email/push is separate infra) | NotificationsPage, Nav bell | not built |
| Account security endpoints (password change, sessions) | ProfilePage | not built |
| User list / role change / deactivate endpoints | AdminUsersPage | not built |
| Admin-scoped unfiltered audit log endpoint | AdminAuditPage | not built |
| Aggregate portfolio-stats endpoint | AdminPortfolioPage | not built |
| Config storage + read/write endpoints | AdminSettingsPage | not built |

Already available and reusable as-is: `GET/PUT /profile`, `GET /profile/:userId` (officer), `GET /loans`, `GET /loans/:id`, `POST /loans`, `POST /loans/:id/approve`, `POST /loans/:id/reject`, `POST /loans/:id/installments/:installmentId/pay`, Plaid connect/link-token, KYC upload/confirm, Didit session.

---

## 8. Shared Components

| Component | Used by |
|---|---|
| `Nav` | global |
| `ProtectedRoute` | global (extended with role gating, already supports it) |
| `PlaidLinkButton` | Onboarding, Profile |
| `DataTable` | Documents, AdminAudit, AdminUsers, loan history panels |
| `PaymentModal` | LoanDetailPage (installment pay), Dashboard (upfront pay) — generalized from the existing `UpfrontPaymentModal` |
| `NotificationBell` | Nav, NotificationsPage |
| `StatCard` | AdminPortfolioPage |

---

## Out of Scope

- Visual design system, color/typography choices — left to the UI generation step.
- Mobile-responsive design specifics.
- Pagination thresholds for tables (add when lists grow).
- Any of the backend endpoints listed in §7 — this document defines frontend structure only.
