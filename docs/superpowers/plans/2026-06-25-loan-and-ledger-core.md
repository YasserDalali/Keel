# Loan & Ledger Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A borrower can request a loan, an officer/admin can approve it (which generates the installment schedule and records a disbursement transaction), and a borrower can pay an installment (which records a repayment transaction and closes the loan out once fully paid) — all against the real D1 `loans`/`installments`/`transactions` tables from CLOUDFLARE_MICROLOAN_PLAN.md §3.

**Architecture:** A pure `generateInstallments` function (no bindings) computes the amortization schedule so it's unit-testable in isolation. `routes/loans.ts` holds four endpoints, gated by the `auth-and-sessions` plan's `requireAuth` middleware plus a new `requireRole` middleware for the officer-only approval step. Approval and repayment each touch multiple tables (loan status + N installment rows + 1 transaction row), so both use `D1Database.batch()` for atomicity instead of separate sequential `.run()` calls.

**Tech Stack:** Hono, Cloudflare D1 (`batch()` for multi-statement atomicity), Vitest + `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Builds on the Foundation plan (`docs/superpowers/plans/2026-06-25-foundation-setup.md`) for the D1 schema, and the `auth-and-sessions` plan for `requireAuth`, `Bindings`, and `Variables` (`api/src/types.ts`, `api/src/middleware/requireAuth.ts`). If `auth-and-sessions` hasn't been executed yet, Task 2 below creates the minimal `requireAuth`/`types.ts` stand-in needed to proceed — do not block on it.
- `loans.status` transitions are exactly `pending → active → fully_paid` in this plan (per the CHECK constraint's allowed values `'pending', 'under_review', 'approved', 'active', 'fully_paid', 'defaulted'` — this plan only uses the subset it needs; `'under_review'`, `'approved'` as a distinct pre-active state, and `'defaulted'` belong to the future `credit-risk-engine` plan).
- **Interest rate is a hardcoded flat 5% placeholder** (`FLAT_INTEREST_RATE = 0.05` in `routes/loans.ts`) applied at loan-request time. Real risk-based pricing is the `credit-risk-engine` plan's job (CLOUDFLARE_MICROLOAN_PLAN.md §4.B) — do not build risk scoring here.
- `transactions.payment_method` is constrained to `'stripe' | 'bank_transfer' | 'mock_gateway'` per the D1 schema CHECK constraint — this plan uses `'mock_gateway'` for the system-generated disbursement and accepts any of the three for borrower-submitted repayments (no real payment gateway integration here).
- All multi-row writes (approval, repayment) use `D1Database.batch()`, never sequential `.run()` calls, so a partial failure can't leave the loan and its installments/transactions out of sync.

---

## File Structure

```
microloans/
├── api/
│   ├── src/
│   │   ├── index.ts                       # MODIFIED: mounts /api/loans
│   │   ├── loans/
│   │   │   └── amortization.ts            # NEW: generateInstallments (pure)
│   │   ├── middleware/
│   │   │   └── requireRole.ts             # NEW: officer/admin role gate
│   │   └── routes/
│   │       └── loans.ts                   # NEW: POST /, GET /:id, POST /:id/approve, POST /:id/installments/:id/pay
│   └── test/
│       ├── amortization.spec.ts           # NEW
│       └── loans.spec.ts                  # NEW
```

- `loans/amortization.ts` lives in its own folder (mirroring `auth/` from the `auth-and-sessions` plan) because it's pure business-logic math, distinct from the route handler and from any future `loans/risk.ts` the `credit-risk-engine` plan might add.
- `middleware/requireRole.ts` is separate from `requireAuth` so role-gating can be composed onto any future route (e.g., an admin-only endpoint in `admin-and-zero-trust`) without duplicating JWT verification.

---

## Task 1: Amortization Schedule Calculator

**Files:**
- Create: `api/src/loans/amortization.ts`
- Test: `api/test/amortization.spec.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `Installment` type (`{ installmentNumber: number; dueDate: string; amountDue: number }`) and `generateInstallments(principal: number, interestRate: number, termMonths: number, startDate: Date): Installment[]` — consumed by Task 4's approval endpoint.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/amortization.spec.ts
import { describe, expect, it } from "vitest";
import { generateInstallments } from "../src/loans/amortization";

describe("generateInstallments", () => {
  it("produces one installment per term month", () => {
    const schedule = generateInstallments(1200, 0.05, 6, new Date("2026-01-01"));
    expect(schedule).toHaveLength(6);
    expect(schedule.map((i) => i.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("sums installments to exactly principal plus flat interest", () => {
    const schedule = generateInstallments(1200, 0.05, 6, new Date("2026-01-01"));
    const total = schedule.reduce((sum, i) => sum + i.amountDue, 0);
    expect(Math.round(total * 100) / 100).toBe(1260);
  });

  it("sets due dates on consecutive months after the start date", () => {
    const schedule = generateInstallments(1200, 0.05, 3, new Date("2026-01-15"));
    expect(schedule.map((i) => i.dueDate)).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/loans/amortization'`.

- [ ] **Step 3: Implement `api/src/loans/amortization.ts`**

```typescript
export type Installment = {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
};

export function generateInstallments(
  principal: number,
  interestRate: number,
  termMonths: number,
  startDate: Date
): Installment[] {
  const totalRepayment = principal * (1 + interestRate);
  const baseAmount = Math.round((totalRepayment / termMonths) * 100) / 100;

  const installments: Installment[] = [];
  let remaining = totalRepayment;

  for (let i = 1; i <= termMonths; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    const isLastInstallment = i === termMonths;
    const amountDue = isLastInstallment ? Math.round(remaining * 100) / 100 : baseAmount;
    remaining = Math.round((remaining - amountDue) * 100) / 100;

    installments.push({
      installmentNumber: i,
      dueDate: dueDate.toISOString().slice(0, 10),
      amountDue,
    });
  }

  return installments;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — all 3 tests in `amortization.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add api/src/loans/amortization.ts api/test/amortization.spec.ts
git commit -m "feat: add amortization schedule calculator"
```

---

## Task 2: requireRole Middleware

**Files:**
- Create: `api/src/middleware/requireRole.ts`
- Test: `api/test/loans.spec.ts` (created here, extended in later tasks)

**Interfaces:**
- Consumes: `Bindings`/`Variables` (`api/src/types.ts` from `auth-and-sessions`; if that plan hasn't run yet, this file must already exist per that plan's Task 1 — do not duplicate it).
- Produces: `requireRole(...allowedRoles: Variables["role"][])` — a Hono middleware factory — consumed by Task 4's approval endpoint.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/loans.spec.ts
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireRole } from "../src/middleware/requireRole";
import type { Bindings, Variables } from "../src/types";

describe("requireRole", () => {
  function buildTestApp() {
    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.use("*", async (c, next) => {
      c.set("role", c.req.header("X-Test-Role") as Variables["role"]);
      await next();
    });
    app.get("/officer-only", requireRole("officer", "admin"), (c) => c.json({ ok: true }));
    return app;
  }

  it("allows a role in the allowed list", async () => {
    const app = buildTestApp();
    const res = await app.request("/officer-only", { headers: { "X-Test-Role": "officer" } }, env);
    expect(res.status).toBe(200);
  });

  it("rejects a role not in the allowed list with 403", async () => {
    const app = buildTestApp();
    const res = await app.request("/officer-only", { headers: { "X-Test-Role": "borrower" } }, env);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/middleware/requireRole'`.

- [ ] **Step 3: Implement `api/src/middleware/requireRole.ts`**

```typescript
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../types";

export function requireRole(...allowedRoles: Variables["role"][]) {
  return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    if (!allowedRoles.includes(c.var.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both tests in `loans.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add api/src/middleware/requireRole.ts api/test/loans.spec.ts
git commit -m "feat: add requireRole middleware"
```

---

## Task 3: POST /api/loans and GET /api/loans/:id

**Files:**
- Create: `api/src/routes/loans.ts`
- Modify: `api/src/index.ts`
- Modify: `api/test/loans.spec.ts`

**Interfaces:**
- Consumes: `requireAuth` (`auth-and-sessions` plan's `api/src/middleware/requireAuth.ts`), `Bindings`/`Variables` (`api/src/types.ts`).
- Produces: `loans` Hono sub-app exported from `api/src/routes/loans.ts`, mounted at `/api/loans` — Task 4 and Task 5 add more routes to this same file/sub-app.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/loans.spec.ts — add to the existing file
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";

async function authHeaderFor(userId: string, role: "borrower" | "officer" | "admin"): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

async function insertTestUser(userId: string, email: string, role: "borrower" | "officer" | "admin"): Promise<void> {
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'unused', ?)")
    .bind(userId, email, role)
    .run();
}

describe("POST /api/loans", () => {
  it("creates a pending loan request for the authenticated borrower", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "loan-borrower@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const res = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1200, termMonths: 6 }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(typeof body.id).toBe("string");
  });

  it("rejects a non-positive amount with 400", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "bad-amount@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const res = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -5, termMonths: 6 }),
      },
      env
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/loans/:id", () => {
  it("returns the loan and its (empty, pre-approval) installments", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "loan-getter@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 500, termMonths: 3 }),
      },
      env
    );
    const { id } = await createRes.json<{ id: string }>();

    const getRes = await app.request(`/api/loans/${id}`, { headers }, env);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.loan.id).toBe(id);
    expect(body.installments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — 404 (no `/api/loans` route registered yet).

- [ ] **Step 3: Implement `api/src/routes/loans.ts`**

```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";

const FLAT_INTEREST_RATE = 0.05;

const loans = new Hono<{ Bindings: Bindings; Variables: Variables }>();

loans.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; termMonths: number }>();

  if (body.amount <= 0 || body.termMonths <= 0) {
    return c.json({ error: "amount and termMonths must be positive" }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  )
    .bind(id, c.var.userId, body.amount, FLAT_INTEREST_RATE, body.termMonths)
    .run();

  return c.json({ id, status: "pending" }, 201);
});

loans.get("/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first();
  if (!loan) {
    return c.json({ error: "Loan not found" }, 404);
  }

  const { results: installments } = await c.env.DB.prepare(
    "SELECT * FROM installments WHERE loan_id = ? ORDER BY installment_number"
  )
    .bind(loanId)
    .all();

  return c.json({ loan, installments });
});

export default loans;
```

- [ ] **Step 4: Mount the loans sub-app in `api/src/index.ts`**

```typescript
import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);

export default app;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — all tests in `loans.spec.ts`, plus the full existing suite.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/loans.ts api/src/index.ts api/test/loans.spec.ts
git commit -m "feat: add POST /api/loans and GET /api/loans/:id"
```

---

## Task 4: POST /api/loans/:id/approve (Installments + Disbursement)

**Files:**
- Modify: `api/src/routes/loans.ts`
- Modify: `api/test/loans.spec.ts`

**Interfaces:**
- Consumes: `generateInstallments` (Task 1), `requireRole` (Task 2), the `/` and `/:id` routes already in this file (Task 3) to set up fixtures in tests.
- Produces: `POST /api/loans/:id/approve` — transitions a `pending` loan to `active`, inserts its full installment schedule, and records one `disbursement` transaction — consumed by Task 5's repayment tests (which need an active loan with installments to pay against).

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/loans.spec.ts — add to the existing file
describe("POST /api/loans/:id/approve", () => {
  it("activates the loan, creates installments, and records a disbursement", async () => {
    const borrowerId = crypto.randomUUID();
    const officerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "approve-borrower@example.com", "borrower");
    await insertTestUser(officerId, "approve-officer@example.com", "officer");
    const borrowerHeaders = await authHeaderFor(borrowerId, "borrower");
    const officerHeaders = await authHeaderFor(officerId, "officer");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...borrowerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1200, termMonths: 6 }),
      },
      env
    );
    const { id: loanId } = await createRes.json<{ id: string }>();

    const approveRes = await app.request(
      `/api/loans/${loanId}/approve`,
      { method: "POST", headers: officerHeaders },
      env
    );
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.status).toBe("active");
    expect(approveBody.installmentCount).toBe(6);

    const getRes = await app.request(`/api/loans/${loanId}`, { headers: borrowerHeaders }, env);
    const getBody = await getRes.json();
    expect(getBody.loan.status).toBe("active");
    expect(getBody.installments).toHaveLength(6);

    const txRes = await env.DB.prepare(
      "SELECT type, amount FROM transactions WHERE loan_id = ?"
    )
      .bind(loanId)
      .all<{ type: string; amount: number }>();
    expect(txRes.results).toEqual([{ type: "disbursement", amount: 1200 }]);
  });

  it("rejects approval from a borrower with 403", async () => {
    const borrowerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "no-approve@example.com", "borrower");
    const headers = await authHeaderFor(borrowerId, "borrower");

    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 500, termMonths: 3 }),
      },
      env
    );
    const { id: loanId } = await createRes.json<{ id: string }>();

    const approveRes = await app.request(
      `/api/loans/${loanId}/approve`,
      { method: "POST", headers },
      env
    );
    expect(approveRes.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — 404 (no `/:id/approve` route registered yet).

- [ ] **Step 3: Add the `/:id/approve` route to `api/src/routes/loans.ts`**

```typescript
// add these imports at the top of api/src/routes/loans.ts
import { requireRole } from "../middleware/requireRole";
import { generateInstallments } from "../loans/amortization";

// add below the GET /:id handler, still inside the same file
loans.post("/:id/approve", requireAuth, requireRole("officer", "admin"), async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare(
    "SELECT id, amount, interest_rate, term_months FROM loans WHERE id = ? AND status = 'pending'"
  )
    .bind(loanId)
    .first<{ id: string; amount: number; interest_rate: number; term_months: number }>();

  if (!loan) {
    return c.json({ error: "Pending loan not found" }, 404);
  }

  const schedule = generateInstallments(loan.amount, loan.interest_rate, loan.term_months, new Date());

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE loans SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(c.var.userId, loanId),
    ...schedule.map((installment) =>
      c.env.DB.prepare(
        "INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due) VALUES (?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), loanId, installment.installmentNumber, installment.dueDate, installment.amountDue)
    ),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, loan_id, type, amount, payment_method, status) VALUES (?, ?, 'disbursement', ?, 'mock_gateway', 'completed')"
    ).bind(crypto.randomUUID(), loanId, loan.amount),
  ]);

  return c.json({ id: loanId, status: "active", installmentCount: schedule.length });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both new tests, plus the full existing suite.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/loans.ts api/test/loans.spec.ts
git commit -m "feat: add POST /api/loans/:id/approve with installment generation"
```

---

## Task 5: POST /api/loans/:id/installments/:installmentId/pay

**Files:**
- Modify: `api/src/routes/loans.ts`
- Modify: `api/test/loans.spec.ts`

**Interfaces:**
- Consumes: the `/:id/approve` route already in this file (Task 4) to set up an active loan with installments in tests.
- Produces: `POST /api/loans/:id/installments/:installmentId/pay` — records a `repayment` transaction, updates the installment's `amount_paid`/`status`, and flips the loan to `fully_paid` once every installment is `paid`.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/loans.spec.ts — add to the existing file
describe("POST /api/loans/:id/installments/:installmentId/pay", () => {
  async function createActiveLoanWithInstallments(
    borrowerHeaders: Record<string, string>,
    officerHeaders: Record<string, string>,
    amount: number,
    termMonths: number
  ): Promise<{ loanId: string; installmentIds: string[] }> {
    const createRes = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...borrowerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, termMonths }),
      },
      env
    );
    const { id: loanId } = await createRes.json<{ id: string }>();

    await app.request(`/api/loans/${loanId}/approve`, { method: "POST", headers: officerHeaders }, env);

    const getRes = await app.request(`/api/loans/${loanId}`, { headers: borrowerHeaders }, env);
    const { installments } = await getRes.json<{ installments: { id: string }[] }>();

    return { loanId, installmentIds: installments.map((i) => i.id) };
  }

  it("marks an installment paid and records a repayment transaction", async () => {
    const borrowerId = crypto.randomUUID();
    const officerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "pay-borrower@example.com", "borrower");
    await insertTestUser(officerId, "pay-officer@example.com", "officer");
    const borrowerHeaders = await authHeaderFor(borrowerId, "borrower");
    const officerHeaders = await authHeaderFor(officerId, "officer");

    const { loanId, installmentIds } = await createActiveLoanWithInstallments(
      borrowerHeaders,
      officerHeaders,
      300,
      3
    );

    const payRes = await app.request(
      `/api/loans/${loanId}/installments/${installmentIds[0]}/pay`,
      {
        method: "POST",
        headers: { ...borrowerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 105, paymentMethod: "mock_gateway" }),
      },
      env
    );

    expect(payRes.status).toBe(200);
    const body = await payRes.json();
    expect(body.status).toBe("paid");
  });

  it("flips the loan to fully_paid once every installment is paid", async () => {
    const borrowerId = crypto.randomUUID();
    const officerId = crypto.randomUUID();
    await insertTestUser(borrowerId, "fully-paid-borrower@example.com", "borrower");
    await insertTestUser(officerId, "fully-paid-officer@example.com", "officer");
    const borrowerHeaders = await authHeaderFor(borrowerId, "borrower");
    const officerHeaders = await authHeaderFor(officerId, "officer");

    const { loanId, installmentIds } = await createActiveLoanWithInstallments(
      borrowerHeaders,
      officerHeaders,
      200,
      2
    );

    for (const installmentId of installmentIds) {
      await app.request(
        `/api/loans/${loanId}/installments/${installmentId}/pay`,
        {
          method: "POST",
          headers: { ...borrowerHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 105, paymentMethod: "mock_gateway" }),
        },
        env
      );
    }

    const getRes = await app.request(`/api/loans/${loanId}`, { headers: borrowerHeaders }, env);
    const { loan } = await getRes.json<{ loan: { status: string } }>();
    expect(loan.status).toBe("fully_paid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — 404 (no `/installments/:installmentId/pay` route registered yet).

- [ ] **Step 3: Add the `/pay` route to `api/src/routes/loans.ts`**

```typescript
// add below the /:id/approve handler, still inside the same file
loans.post("/:id/installments/:installmentId/pay", requireAuth, async (c) => {
  const loanId = c.req.param("id");
  const installmentId = c.req.param("installmentId");
  const body = await c.req.json<{
    amount: number;
    paymentMethod: "stripe" | "bank_transfer" | "mock_gateway";
  }>();

  const installment = await c.env.DB.prepare(
    "SELECT id, amount_due, amount_paid FROM installments WHERE id = ? AND loan_id = ?"
  )
    .bind(installmentId, loanId)
    .first<{ id: string; amount_due: number; amount_paid: number }>();

  if (!installment) {
    return c.json({ error: "Installment not found" }, 404);
  }

  const newAmountPaid = installment.amount_paid + body.amount;
  const newStatus = newAmountPaid >= installment.amount_due ? "paid" : "partial";

  await c.env.DB.batch([
    c.env.DB.prepare(
      newStatus === "paid"
        ? "UPDATE installments SET amount_paid = ?, status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?"
        : "UPDATE installments SET amount_paid = ?, status = ? WHERE id = ?"
    ).bind(newAmountPaid, newStatus, installmentId),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, loan_id, installment_id, type, amount, payment_method, status) VALUES (?, ?, ?, 'repayment', ?, ?, 'completed')"
    ).bind(crypto.randomUUID(), loanId, installmentId, body.amount, body.paymentMethod),
  ]);

  const unpaidCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM installments WHERE loan_id = ? AND status != 'paid'"
  )
    .bind(loanId)
    .first<{ count: number }>();

  if (unpaidCount?.count === 0) {
    await c.env.DB.prepare(
      "UPDATE loans SET status = 'fully_paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(loanId)
      .run();
  }

  return c.json({ installmentId, status: newStatus });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both new tests, plus the full existing suite.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/loans.ts api/test/loans.spec.ts
git commit -m "feat: add POST /api/loans/:id/installments/:installmentId/pay"
```

---

## Task 6: Wrangler Dev Smoke Test (Full Loan Lifecycle)

**Files:**
- Modify: none (verification-only task)

**Interfaces:**
- Consumes: everything from Tasks 1–5, plus `auth-and-sessions`'s register/login endpoints.
- Produces: confirmation that the full request → approve → repay → fully_paid lifecycle works under the real `wrangler dev` process with real local D1.

- [ ] **Step 1: Start the dev server**

Run: `npx wrangler dev --local`
Expected: `Ready on http://localhost:8787`.

- [ ] **Step 2: Register a borrower and capture their token**

Run:
```bash
curl -s -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"loan-smoke-borrower@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'

curl -s -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"loan-smoke-borrower@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'
```
Expected: a `{"token":"..."}` response. Save it as `BORROWER_TOKEN`.

- [ ] **Step 3: Promote an officer directly in local D1 (no admin UI yet) and log in as them**

Run:
```bash
curl -s -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"loan-smoke-officer@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'

npx wrangler d1 execute microloans_db --local \
  --command="UPDATE users SET role = 'officer' WHERE email = 'loan-smoke-officer@example.com';"

curl -s -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"loan-smoke-officer@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'
```
Expected: a `{"token":"..."}` response. Save it as `OFFICER_TOKEN`.

- [ ] **Step 4: Borrower requests a loan**

Run (substitute `$BORROWER_TOKEN`):
```bash
curl -s -X POST http://localhost:8787/api/loans \
  -H "Authorization: Bearer $BORROWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 600, "termMonths": 3}'
```
Expected: `{"id":"<uuid>","status":"pending"}`, HTTP 201. Save the `id` as `LOAN_ID`.

- [ ] **Step 5: Officer approves the loan**

Run (substitute `$OFFICER_TOKEN` and `$LOAN_ID`):
```bash
curl -s -X POST http://localhost:8787/api/loans/$LOAN_ID/approve \
  -H "Authorization: Bearer $OFFICER_TOKEN"
```
Expected: `{"id":"<uuid>","status":"active","installmentCount":3}`.

- [ ] **Step 6: Fetch the loan and capture the first installment id**

Run (substitute `$BORROWER_TOKEN` and `$LOAN_ID`):
```bash
curl -s http://localhost:8787/api/loans/$LOAN_ID \
  -H "Authorization: Bearer $BORROWER_TOKEN"
```
Expected: `loan.status` is `"active"`, `installments` has 3 entries each with `amount_due: 210`. Save the first installment's `id` as `INSTALLMENT_ID`.

- [ ] **Step 7: Borrower pays the first installment**

Run (substitute `$BORROWER_TOKEN`, `$LOAN_ID`, `$INSTALLMENT_ID`):
```bash
curl -s -X POST http://localhost:8787/api/loans/$LOAN_ID/installments/$INSTALLMENT_ID/pay \
  -H "Authorization: Bearer $BORROWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 210, "paymentMethod": "mock_gateway"}'
```
Expected: `{"installmentId":"<uuid>","status":"paid"}`.

- [ ] **Step 8: Stop the dev server**

Press `Ctrl+C` in the terminal running `wrangler dev`.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/plans/2026-06-25-loan-and-ledger-core.md
git commit -m "docs: mark loan-and-ledger-core plan verified end-to-end via wrangler dev"
```

---

## Self-Review Notes

- **Spec coverage:** Tasks 1–6 cover CLOUDFLARE_MICROLOAN_PLAN.md §3's `loans`/`installments`/`transactions` tables and §6 Phase 2.3 ("Transaction Flow: Write D1 transaction queries for processing loan requests and auto-generating installment payment records"). Risk scoring (§4.B) and a real payment gateway are explicitly out of scope — deferred to `credit-risk-engine` and a future payments integration respectively.
- **Placeholder scan:** no TBD/TODO markers; every step has literal file contents and exact `curl`/`npm` commands with expected output. The hardcoded interest rate is named and justified, not left as a vague "TODO: real rate."
- **Type consistency:** `Installment` (Task 1) field names (`installmentNumber`, `dueDate`, `amountDue`) match exactly what Task 4's approval handler destructures. `requireRole`'s `Variables["role"]` parameter type matches the `Variables.role` union defined in `auth-and-sessions`'s `types.ts`. `payment_method` literal union `'stripe' | 'bank_transfer' | 'mock_gateway'` is identical between Task 5's request body type and the D1 CHECK constraint.
