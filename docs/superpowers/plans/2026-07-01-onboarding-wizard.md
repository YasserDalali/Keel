# Onboarding Wizard & Access Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post-registration onboarding wizard for borrowers, role-aware routing, KYC gate on loans, Plaid button persistence fix, and expandable officer loan rows with borrower profile + risk breakdown.

**Architecture:** Backend adds `upsertProfile` + `PUT /api/profile`, an officer-only `GET /api/profile/:userId`, and a KYC guard in `POST /api/loans`. Frontend adds `OnboardingPage` (3-step wizard, step 1 required), role-aware post-login routing in `App.tsx` + `LoginPage.tsx`, Plaid persistence and KYC notice in `DashboardPage`, and expandable rows with lazy profile fetch in `OfficerPage`.

**Tech Stack:** Hono + Cloudflare Workers, D1 (SQLite), AES-GCM field encryption, React 18, react-router-dom, react-plaid-link, Didit SDK

## Global Constraints

- All PII stored encrypted via `encryptField`/`decryptField` from `api/src/crypto.ts`
- No DB migration required — profiles table already has nullable PII columns after migration `0004_didit.sql`
- No new npm dependencies
- API tests: `app.request(url, options, env)` with `env` from `cloudflare:test`; auth via `signJwt({ sub, role }, env.JWT_SECRET, 3600)` from `api/src/auth/jwt.ts`
- Run tests from `api/`: `npx vitest run test/<file>.spec.ts`

---

### Task 1: `upsertProfile` + `PUT /api/profile`

**Files:**
- Modify: `api/src/profiles.ts`
- Modify: `api/src/routes/profile.ts`
- Create: `api/test/profile.spec.ts`

**Interfaces:**
- Produces: `upsertProfile(db: D1Database, encryptionKey: string, input: { userId, firstName, lastName, phone, address, nationalIdNumber }: all strings): Promise<void>`
- Produces: `PUT /api/profile` → 200 `{ ok: true }` | 400 `{ error: string }` | 401

- [ ] **Step 1: Write failing tests**

Create `api/test/profile.spec.ts`:

```typescript
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";
import { getProfile } from "../src/profiles";

async function authHeader(userId: string, role: "borrower" | "officer" | "admin") {
  const token = await signJwt({ sub: userId, role }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

async function insertUser(userId: string, email: string) {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'x', 'borrower')"
  ).bind(userId, email).run();
}

describe("PUT /api/profile", () => {
  it("creates a profile when none exists", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, `put-create-${userId}@test.com`);
    const headers = await authHeader(userId, "borrower");

    const res = await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Alice", lastName: "Smith",
          phone: "0600000001", address: "1 Rue de la Paix",
          nationalIdNumber: "AB123456",
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    expect((await res.json() as { ok: boolean }).ok).toBe(true);

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.firstName).toBe("Alice");
    expect(profile?.lastName).toBe("Smith");
  });

  it("updates an existing profile row", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, `put-update-${userId}@test.com`);
    await env.DB.prepare(
      "INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'pending')"
    ).bind(userId).run();
    const headers = await authHeader(userId, "borrower");

    await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Bob", lastName: "Jones",
          phone: "0600000002", address: "2 Main St",
          nationalIdNumber: "CD789012",
        }),
      },
      env
    );

    const profile = await getProfile(env.DB, env.PII_ENCRYPTION_KEY, userId);
    expect(profile?.firstName).toBe("Bob");
  });

  it("returns 400 when a field is missing", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, `put-400-${userId}@test.com`);
    const headers = await authHeader(userId, "borrower");

    const res = await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Alice" }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await app.request(
      "/api/profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "X", lastName: "X", phone: "X", address: "X", nationalIdNumber: "X",
        }),
      },
      env
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd api && npx vitest run test/profile.spec.ts
```
Expected: FAIL — `PUT /api/profile` route does not exist yet.

- [ ] **Step 3: Add `upsertProfile` to `api/src/profiles.ts`**

Add after the closing brace of `createProfile` (before `upsertVerificationStatus`):

```typescript
export async function upsertProfile(
  db: D1Database,
  encryptionKey: string,
  input: {
    userId: string;
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    nationalIdNumber: string;
  }
): Promise<void> {
  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    encryptField(input.firstName, encryptionKey),
    encryptField(input.lastName, encryptionKey),
    encryptField(input.phone, encryptionKey),
    encryptField(input.address, encryptionKey),
    encryptField(input.nationalIdNumber, encryptionKey),
  ]);

  await db
    .prepare(
      `INSERT INTO profiles (user_id, first_name, last_name, phone, address, national_id_number)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         first_name         = excluded.first_name,
         last_name          = excluded.last_name,
         phone              = excluded.phone,
         address            = excluded.address,
         national_id_number = excluded.national_id_number`
    )
    .bind(input.userId, firstName, lastName, phone, address, nationalIdNumber)
    .run();
}
```

- [ ] **Step 4: Add `PUT /` handler to `api/src/routes/profile.ts`**

Replace the full file:

```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { getProfile, upsertProfile } from "../profiles";
import { getPlaidItem } from "../plaid/items";
import type { Bindings, Variables } from "../types";

const profile = new Hono<{ Bindings: Bindings; Variables: Variables }>();

profile.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;
  const record = await getProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  const bank = await getPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);

  return c.json({
    profile: record,
    kycStatus: record?.kycStatus ?? null,
    bankConnected: bank !== null,
    bankSafetyScore: bank?.bankSafetyScore ?? null,
  });
});

profile.put("/", requireAuth, async (c) => {
  const body = await c.req.json<{
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    nationalIdNumber?: string;
  }>();

  const { firstName, lastName, phone, address, nationalIdNumber } = body;
  if (!firstName || !lastName || !phone || !address || !nationalIdNumber) {
    return c.json(
      { error: "All fields are required: firstName, lastName, phone, address, nationalIdNumber" },
      400
    );
  }

  await upsertProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
    userId: c.var.userId,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
  });

  return c.json({ ok: true });
});

export default profile;
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd api && npx vitest run test/profile.spec.ts
```
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/profiles.ts api/src/routes/profile.ts api/test/profile.spec.ts
git commit -m "feat: add upsertProfile + PUT /api/profile endpoint"
```

---

### Task 2: `GET /api/profile/:userId` (officer-only)

**Files:**
- Modify: `api/src/routes/profile.ts`
- Modify: `api/test/profile.spec.ts`

**Interfaces:**
- Consumes: `getProfile` (already in `profiles.ts`), `requireRole` (already imported after Task 1)
- Produces: `GET /api/profile/:userId` → 200 `{ profile: ProfileRecord }` | 403 | 404

- [ ] **Step 1: Append failing tests to `api/test/profile.spec.ts`**

```typescript
describe("GET /api/profile/:userId", () => {
  it("returns decrypted profile for an officer", async () => {
    const officerId = crypto.randomUUID();
    const borrowerId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'x', 'officer')"
    ).bind(officerId, `officer-${officerId}@test.com`).run();
    await insertUser(borrowerId, `borrow-view-${borrowerId}@test.com`);

    const { upsertProfile } = await import("../src/profiles");
    await upsertProfile(env.DB, env.PII_ENCRYPTION_KEY, {
      userId: borrowerId,
      firstName: "Carol", lastName: "White",
      phone: "0699000001", address: "3 Oak Ave",
      nationalIdNumber: "EF345678",
    });

    const headers = await authHeader(officerId, "officer");
    const res = await app.request(`/api/profile/${borrowerId}`, { headers }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { profile: { firstName: string } };
    expect(body.profile.firstName).toBe("Carol");
  });

  it("returns 403 for a borrower", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, `borrow-403-${userId}@test.com`);
    const headers = await authHeader(userId, "borrower");
    const res = await app.request(
      `/api/profile/${crypto.randomUUID()}`,
      { headers },
      env
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when no profile exists for that user", async () => {
    const officerId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'x', 'officer')"
    ).bind(officerId, `officer-404-${officerId}@test.com`).run();
    const headers = await authHeader(officerId, "officer");
    const res = await app.request(
      `/api/profile/${crypto.randomUUID()}`,
      { headers },
      env
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd api && npx vitest run test/profile.spec.ts -t "GET /api/profile"
```
Expected: FAIL — route not found (404 from Hono, not our 404).

- [ ] **Step 3: Add `GET /:userId` to `api/src/routes/profile.ts`**

Add before `export default profile`:

```typescript
profile.get("/:userId", requireAuth, requireRole("officer", "admin"), async (c) => {
  const userId = c.req.param("userId");
  const record = await getProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  if (!record) return c.json({ error: "Profile not found" }, 404);
  return c.json({ profile: record });
});
```

- [ ] **Step 4: Run all profile tests**

```bash
cd api && npx vitest run test/profile.spec.ts
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/profile.ts api/test/profile.spec.ts
git commit -m "feat: add GET /api/profile/:userId for officers"
```

---

### Task 3: KYC gate on `POST /api/loans`

**Files:**
- Modify: `api/src/routes/loans.ts`
- Modify: `api/test/loans.spec.ts`

**Interfaces:**
- Produces: `POST /api/loans` → 403 `{ error: "KYC verification required before applying for a loan" }` when profile missing or `kyc_status != 'approved'`

- [ ] **Step 1: Add failing test to `api/test/loans.spec.ts`**

Inside the existing `describe("POST /api/loans")` block, add:

```typescript
  it("returns 403 when user has no KYC-approved profile", async () => {
    const userId = crypto.randomUUID();
    await insertTestUser(userId, `kyc-gate-${userId}@test.com`, "borrower");
    // bank connected but no profile row — KYC gate must fire
    await upsertPlaidItem(env.DB, env.PII_ENCRYPTION_KEY, {
      userId,
      itemId: "item-kyc",
      accessToken: "access-kyc",
      institutionName: "Test Bank",
      bankSafetyScore: 90,
      bankSignals: "{}",
    });
    const headers = await authHeaderFor(userId, "borrower");

    const res = await app.request(
      "/api/loans",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 500, termMonths: 6 }),
      },
      env
    );

    expect(res.status).toBe(403);
    expect((await res.json() as { error: string }).error).toMatch(/KYC/i);
  });
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd api && npx vitest run test/loans.spec.ts -t "returns 403 when user has no KYC"
```
Expected: FAIL — currently returns a different status.

- [ ] **Step 3: Add KYC guard to `api/src/routes/loans.ts`**

In the `loans.post("/", requireAuth, async (c) => {` handler, immediately after `const userId = c.var.userId;`, add:

```typescript
  const profileRow = await c.env.DB
    .prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ kyc_status: string }>();

  if (!profileRow || profileRow.kyc_status !== "approved") {
    return c.json({ error: "KYC verification required before applying for a loan" }, 403);
  }
```

- [ ] **Step 4: Run all loan tests**

```bash
cd api && npx vitest run test/loans.spec.ts
```
Expected: all tests PASS. (Existing tests use `enableBorrowing` which already seeds `kyc_status = 'approved'`.)

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/loans.ts api/test/loans.spec.ts
git commit -m "feat: block loan applications when KYC not approved"
```

---

### Task 4: Extract `PlaidLinkButton` to shared component

**Files:**
- Create: `frontend/src/components/PlaidLinkButton.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Produces: `<PlaidLinkButton onConnected={(score: number) => void} />`

- [ ] **Step 1: Create `frontend/src/components/PlaidLinkButton.tsx`**

```typescript
import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../lib/api";

export default function PlaidLinkButton({ onConnected }: { onConnected: (score: number) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    api.POST("/plaid/link-token").then(({ data, error }) => {
      if (data) setLinkToken(data.linkToken);
      else setLinkError(error && "error" in error ? error.error : "Could not get link token");
    });
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      const { data, error } = await api.POST("/plaid/connect", { body: { publicToken } });
      if (data) onConnected(data.bankSafetyScore);
      else setLinkError(error && "error" in error ? error.error : "Exchange failed");
    },
    [onConnected]
  );

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess });

  if (linkError) return <span className="text-red-600 text-sm">{linkError}</span>;

  return (
    <button onClick={() => open()} disabled={!ready || !linkToken}>
      {linkToken ? "Connect Bank (Plaid)" : "Loading…"}
    </button>
  );
}
```

- [ ] **Step 2: Remove the inline `PlaidLinkButton` from `DashboardPage.tsx` and import the component**

In `frontend/src/pages/DashboardPage.tsx`:

Replace the import block at the top with:
```typescript
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { components } from "../lib/api-types";
import UpfrontPaymentModal from "../components/UpfrontPaymentModal";
import PlaidLinkButton from "../components/PlaidLinkButton";
```

Delete the entire `function PlaidLinkButton(...)` function definition (the block from `function PlaidLinkButton` through its closing `}`).

The Plaid button JSX in the return already matches the new component's prop name (`onScore` → rename to `onConnected`). Change the usage in the JSX:
```tsx
{bankScore === null ? (
  <PlaidLinkButton onConnected={setBankScore} />
) : (
  <span className="text-sm">Bank safety score: {bankScore.toFixed(2)}</span>
)}
```

- [ ] **Step 3: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlaidLinkButton.tsx frontend/src/pages/DashboardPage.tsx
git commit -m "refactor: extract PlaidLinkButton to shared component"
```

---

### Task 5: `OnboardingPage.tsx`

**Files:**
- Create: `frontend/src/pages/OnboardingPage.tsx`

**Interfaces:**
- Consumes: `PlaidLinkButton` (Task 4), `apiUrl` from `../lib/api-base`, `DiditSdk` from `@didit-protocol/sdk-web`
- Produces: `export default function OnboardingPage(): JSX.Element`

- [ ] **Step 1: Create `frontend/src/pages/OnboardingPage.tsx`**

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiditSdk } from "@didit-protocol/sdk-web";
import { apiUrl } from "../lib/api-base";
import PlaidLinkButton from "../components/PlaidLinkButton";

type Step = 1 | 2 | 3;

function completeOnboarding(navigate: ReturnType<typeof useNavigate>) {
  localStorage.setItem("onboarding_shown", "1");
  navigate("/dashboard");
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Step 3
  const [consented, setConsented] = useState(false);
  const [kycStarting, setKycStarting] = useState(false);
  const [kycError, setKycError] = useState("");

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    const token = localStorage.getItem("token");
    const res = await fetch(apiUrl("/profile"), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phone, address, nationalIdNumber }),
    });
    if (!res.ok) {
      const json = await res.json() as { error?: string };
      setProfileError(json.error ?? "Failed to save profile");
      setProfileSaving(false);
      return;
    }
    setProfileSaving(false);
    setStep(2);
  }

  async function startKyc() {
    setKycStarting(true);
    setKycError("");
    const token = localStorage.getItem("token");
    const res = await fetch(apiUrl("/kyc/session"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { url?: string; error?: string; detail?: string };
    if (!res.ok || !json.url) {
      setKycError(json.error ?? json.detail ?? "Failed to start verification");
      setKycStarting(false);
      return;
    }
    DiditSdk.shared.onComplete = () => completeOnboarding(navigate);
    await DiditSdk.shared.startVerification({ url: json.url });
    setKycStarting(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="flex flex-col gap-6 w-full max-w-md">
        <div className="flex gap-3 text-sm text-gray-500">
          {(["Profile", "Bank", "Verification"] as const).map((label, i) => (
            <span key={label} className={step === i + 1 ? "font-semibold text-gray-900" : ""}>
              {i + 1}. {label}{i < 2 ? " →" : ""}
            </span>
          ))}
        </div>

        {step === 1 && (
          <form className="flex flex-col gap-4" onSubmit={submitProfile}>
            <h2 className="text-lg font-semibold">Your profile</h2>
            <p className="text-sm text-gray-600">Required to continue.</p>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm">First name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm">Last name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">National ID number</label>
              <input value={nationalIdNumber} onChange={(e) => setNationalIdNumber(e.target.value)} required />
            </div>
            {profileError && <p className="text-red-600 text-sm">{profileError}</p>}
            <button type="submit" disabled={profileSaving}>
              {profileSaving ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Connect your bank</h2>
            <p className="text-sm text-gray-600">
              Connecting a bank improves your loan eligibility score.
            </p>
            <PlaidLinkButton onConnected={() => setStep(3)} />
            <button
              className="text-sm underline text-gray-500 self-start"
              onClick={() => setStep(3)}
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Identity verification</h2>
            <p className="text-sm text-gray-600">
              Verify your identity to unlock loan applications. You can do this later from the dashboard.
            </p>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="mt-1"
              />
              <span>
                I consent to identity verification via Didit, including capture of my ID document
                and biometric liveness check, for KYC purposes.
              </span>
            </label>
            {kycError && <p className="text-red-600 text-sm">{kycError}</p>}
            <button onClick={startKyc} disabled={kycStarting || !consented}>
              {kycStarting ? "Opening verification…" : "Start Verification"}
            </button>
            <button
              className="text-sm underline text-gray-500 self-start"
              onClick={() => completeOnboarding(navigate)}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles (route not wired yet — that's Task 6)**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors (unused import warnings are OK; route missing warning is OK).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/OnboardingPage.tsx
git commit -m "feat: OnboardingPage wizard (profile required, bank+KYC skippable)"
```

---

### Task 6: Role-aware routing in `App.tsx` + `LoginPage.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Modifies: `AuthCtx.login` return type → `Promise<Me | null>` (was `Promise<void>`)

- [ ] **Step 1: Replace `frontend/src/App.tsx`**

```typescript
import { createContext, useContext, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api";
import type { components } from "./lib/api-types";
import Nav from "./components/Nav";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import KycPage from "./pages/KycPage";
import DashboardPage from "./pages/DashboardPage";
import OfficerPage from "./pages/OfficerPage";
import OnboardingPage from "./pages/OnboardingPage";

type Me = components["schemas"]["Me"];

interface AuthCtx {
  user: Me | null;
  login: (token: string) => Promise<Me | null>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthContext");
  return ctx;
}

function homeDestination(user: Me | null): string {
  if (!user) return "/login";
  if (user.role === "officer" || user.role === "admin") return "/officer";
  if (!localStorage.getItem("onboarding_shown")) return "/onboarding";
  return "/dashboard";
}

export default function App() {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe(): Promise<Me | null> {
    const { data } = await api.GET("/auth/me");
    const me = data ?? null;
    setUser(me);
    return me;
  }

  useEffect(() => {
    if (localStorage.getItem("token")) {
      fetchMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(token: string): Promise<Me | null> {
    localStorage.setItem("token", token);
    return fetchMe();
  }

  async function logout() {
    await api.POST("/auth/logout");
    localStorage.removeItem("token");
    setUser(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">Loading...</div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute>
                <KycPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/officer"
            element={
              <ProtectedRoute roles={["officer", "admin"]}>
                <OfficerPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to={homeDestination(user)} replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Update the post-login `navigate` call in `frontend/src/pages/LoginPage.tsx`**

Find the two lines:
```typescript
    await login(data.token);
    navigate("/dashboard");
```

Replace with:
```typescript
    const me = await login(data.token);
    if (!me) return;
    if (me.role === "officer" || me.role === "admin") {
      navigate("/officer");
    } else if (!localStorage.getItem("onboarding_shown")) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat: role-aware post-login routing, add /onboarding route"
```

---

### Task 7: `DashboardPage.tsx` — Plaid persistence + KYC notice

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Replace `frontend/src/pages/DashboardPage.tsx`**

```typescript
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { components } from "../lib/api-types";
import UpfrontPaymentModal from "../components/UpfrontPaymentModal";
import PlaidLinkButton from "../components/PlaidLinkButton";

type Loan = components["schemas"]["Loan"] & {
  upfront_required?: number;
  upfront_amount?: number;
  upfront_paid?: number;
};

export default function DashboardPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [amount, setAmount] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [applyError, setApplyError] = useState("");
  const [bankConnected, setBankConnected] = useState(false);
  const [kycApproved, setKycApproved] = useState(false);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);

  async function fetchLoans() {
    const { data } = await api.GET("/loans");
    if (data) setLoans(data.loans as Loan[]);
  }

  useEffect(() => {
    fetchLoans();
    (api.GET as Function)("/profile").then(
      ({ data }: { data?: { bankConnected?: boolean; kycStatus?: string } }) => {
        if (data) {
          setBankConnected(data.bankConnected ?? false);
          setKycApproved(data.kycStatus === "approved");
        }
      }
    );
  }, []);

  async function applyLoan(e: React.FormEvent) {
    e.preventDefault();
    setApplyError("");
    const { data, error } = await api.POST("/loans", {
      body: { amount: Number(amount), termMonths: Number(termMonths) },
    });
    if (error) {
      setApplyError("error" in error ? error.error : "Application failed");
      return;
    }
    if (data) {
      setAmount("");
      setTermMonths("");
      await fetchLoans();
    }
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex gap-4 items-center">
        <h1 className="text-xl font-semibold">My Loans</h1>
        {!bankConnected ? (
          <PlaidLinkButton onConnected={() => setBankConnected(true)} />
        ) : (
          <span className="text-sm text-green-700">Bank connected ✓</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {loans.length === 0 && <p className="text-gray-500">No loans yet.</p>}
        {loans.map((loan) => (
          <div key={loan.id} className="flex gap-6 items-center border p-3 flex-wrap">
            <span className="font-mono text-sm">{loan.id.slice(0, 8)}…</span>
            <span>${loan.amount.toLocaleString()}</span>
            <span>{loan.term_months} mo</span>
            <span>{loan.status}</span>
            <span className="text-sm text-gray-500">
              {new Date(loan.created_at).toLocaleDateString()}
            </span>
            {loan.upfront_required === 1 && (
              loan.upfront_paid === 1 ? (
                <span className="text-green-700 text-sm">Upfront paid ✓</span>
              ) : (
                <button
                  className="text-sm bg-amber-100 border border-amber-400 px-2 py-1 rounded"
                  onClick={() => setPayingLoan(loan)}
                >
                  Pay upfront ${loan.upfront_amount?.toFixed(2)}
                </button>
              )
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Apply for a loan</h2>
        {!kycApproved ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            Identity verification required to apply for a loan.{" "}
            <Link to="/kyc" className="underline font-medium">
              Complete verification →
            </Link>
          </p>
        ) : (
          <form className="flex gap-3 items-end" onSubmit={applyLoan}>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Amount ($)</label>
              <input
                type="number"
                placeholder="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm">Term (months)</label>
              <input
                type="number"
                placeholder="12"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                required
                min="1"
              />
            </div>
            <button type="submit">Apply</button>
          </form>
        )}
        {applyError && <p className="text-red-600 text-sm">{applyError}</p>}
      </div>

      {payingLoan && (
        <UpfrontPaymentModal
          loanId={payingLoan.id}
          amount={payingLoan.upfront_amount ?? 0}
          onPaid={() => { setPayingLoan(null); fetchLoans(); }}
          onClose={() => setPayingLoan(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: persist Plaid connection state, gate loan form on KYC"
```

---

### Task 8: `OfficerPage.tsx` — expandable rows

**Files:**
- Modify: `frontend/src/pages/OfficerPage.tsx`

**Interfaces:**
- Consumes: `GET /api/profile/:userId` (Task 2), `apiUrl` from `../lib/api-base`
- The `risk_assessment_summary` JSON shape stored by `POST /api/loans`: `{ finalScore: number, bankSafety: number, behavior: number, weights: Record<string, number>, threshold: number }`

- [ ] **Step 1: Replace `frontend/src/pages/OfficerPage.tsx`**

```typescript
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { apiUrl } from "../lib/api-base";
import type { components } from "../lib/api-types";

type Loan = components["schemas"]["Loan"] & {
  risk_assessment_summary?: string;
  borrower_id: string;
};

type ProfileRecord = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  nationalIdNumber: string | null;
  kycStatus: string;
};

type RiskSummary = {
  finalScore: number;
  bankSafety: number;
  behavior: number;
  weights: Record<string, number>;
  threshold: number;
};

export default function OfficerPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // "loading" = in-flight, null = failed/not-found, ProfileRecord = loaded; absent key = never fetched
  const [profiles, setProfiles] = useState<Record<string, "loading" | null | ProfileRecord>>({});

  async function fetchLoans() {
    const { data } = await api.GET("/loans", {
      params: { query: { status: "pending" } },
    });
    if (data) setLoans(data.loans as Loan[]);
  }

  useEffect(() => { fetchLoans(); }, []);

  async function loadProfile(borrowerId: string) {
    if (borrowerId in profiles) return; // already loading or loaded
    setProfiles((p) => ({ ...p, [borrowerId]: "loading" }));
    const token = localStorage.getItem("token");
    const res = await fetch(apiUrl(`/profile/${borrowerId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setProfiles((p) => ({ ...p, [borrowerId]: null }));
      return;
    }
    const { profile } = await res.json() as { profile: ProfileRecord };
    setProfiles((p) => ({ ...p, [borrowerId]: profile }));
  }

  function toggleExpand(loan: Loan) {
    const next = !expanded[loan.id];
    setExpanded((e) => ({ ...e, [loan.id]: next }));
    if (next) loadProfile(loan.borrower_id);
  }

  async function approve(id: string) {
    setError("");
    const { error: err } = await api.POST("/loans/{id}/approve", {
      params: { path: { id } },
    });
    if (err && "error" in err) { setError(err.error); return; }
    await fetchLoans();
  }

  async function reject(id: string) {
    setError("");
    const { error: err } = await api.POST("/loans/{id}/reject", {
      params: { path: { id } },
    });
    if (err && "error" in err) { setError(err.error); return; }
    await fetchLoans();
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Pending Loans</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loans.length === 0 && <p className="text-gray-500">No pending loans.</p>}
      {loans.map((loan) => {
        const isExpanded = expanded[loan.id];
        const profile = profiles[loan.borrower_id];
        const risk: RiskSummary | null = loan.risk_assessment_summary
          ? (JSON.parse(loan.risk_assessment_summary) as RiskSummary)
          : null;

        return (
          <div key={loan.id} className="border">
            <div className="flex gap-6 items-center p-3">
              <button
                onClick={() => toggleExpand(loan)}
                className="text-gray-400 text-xs w-4 shrink-0"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
              <span className="font-mono text-sm">{loan.id.slice(0, 8)}…</span>
              <span>${loan.amount.toLocaleString()}</span>
              <span>{loan.term_months} mo</span>
              {loan.risk_assessment_score != null && (
                <span className="text-sm">risk: {loan.risk_assessment_score.toFixed(2)}</span>
              )}
              <span className="text-sm text-gray-500">
                {new Date(loan.created_at).toLocaleDateString()}
              </span>
              <div className="flex gap-2 ml-auto">
                <button onClick={() => approve(loan.id)}>Approve</button>
                <button onClick={() => reject(loan.id)}>Reject</button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t p-4 bg-gray-50 grid grid-cols-2 gap-6 text-sm">
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-gray-700">Borrower Profile</p>
                  {profile === "loading" ? (
                    <p className="text-gray-400">Loading…</p>
                  ) : profile === null ? (
                    <p className="text-gray-400">No profile found</p>
                  ) : profile === undefined ? null : (
                    <dl className="flex flex-col gap-1">
                      {(
                        [
                          ["Name", `${profile.firstName ?? "—"} ${profile.lastName ?? ""}`.trim()],
                          ["Phone", profile.phone ?? "—"],
                          ["Address", profile.address ?? "—"],
                          ["National ID", profile.nationalIdNumber ?? "—"],
                          ["KYC status", profile.kycStatus],
                        ] as [string, string][]
                      ).map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="text-gray-500 w-24 shrink-0">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="font-medium text-gray-700">Risk Breakdown</p>
                  {risk ? (
                    <dl className="flex flex-col gap-1">
                      {(
                        [
                          ["Final score", risk.finalScore.toFixed(2)],
                          ["Bank safety", risk.bankSafety.toFixed(2)],
                          ["Behaviour", risk.behavior.toFixed(2)],
                          ["Threshold", String(risk.threshold)],
                          ...Object.entries(risk.weights).map(([k, v]) => [
                            `w(${k})`,
                            String(v),
                          ] as [string, string]),
                        ] as [string, string][]
                      ).map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="text-gray-500 w-28 shrink-0">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-gray-400">No risk data</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

- [ ] **Step 3: Run all API tests to confirm no regressions**

```bash
cd api && npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/OfficerPage.tsx
git commit -m "feat: expandable officer loan rows with borrower profile and risk details"
```
