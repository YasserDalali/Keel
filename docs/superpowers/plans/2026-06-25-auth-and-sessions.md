# Auth & Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registration and login against the `users` table, stateless JWT auth, Turnstile bot-blocking on both endpoints, and a KV-backed token blacklist so logout actually revokes a token before it expires.

**Architecture:** Password hashing (PBKDF2 via Web Crypto) and JWT signing/verification (HMAC-SHA256 via Web Crypto) are pure functions with no Cloudflare bindings, so they're unit-tested directly. `requireAuth` is a Hono middleware that verifies the JWT and checks the `LOAN_CACHE` KV namespace for a blacklist entry keyed by the token's `jti`. Turnstile verification calls Cloudflare's real `siteverify` endpoint using Cloudflare's publicly documented always-pass/always-fail dummy test keys — no mocking, consistent with how the Foundation plan tests D1/KV against real Miniflare bindings.

**Tech Stack:** Hono, Web Crypto API (`crypto.subtle`), Cloudflare KV, Cloudflare Turnstile `siteverify` API, Vitest + `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Builds on the Foundation plan (`docs/superpowers/plans/2026-06-25-foundation-setup.md`) — `users` table, Hono `app` in `api/src/index.ts`, and `DB`/`LOAN_CACHE` bindings already exist. Do not re-create them.
- No secrets committed. `JWT_SECRET` and `TURNSTILE_SECRET` are read from environment bindings (`c.env`), supplied locally via a gitignored `api/.dev.vars` file (or `.dev.vars` at repo root next to `wrangler.toml` — Wrangler auto-loads whichever is adjacent to the config it's running) and in production via `wrangler secret put`.
- `users.role` is constrained to `'borrower' | 'officer' | 'admin'` per the D1 schema CHECK constraint (CLOUDFLARE_MICROLOAN_PLAN.md §3) — the `Variables.role` type below must match exactly.
- Turnstile tests use Cloudflare's publicly documented test keys (not secrets): sitekey is irrelevant server-side; secret `1x0000000000000000000000000000000AA` always passes, secret `2x0000000000000000000000000000000AA` always fails, and the dummy response token is always `XXXX.DUMMY.TOKEN.XXXX`. These are safe to commit — they are Cloudflare's own published test fixtures, not real credentials.
- JWTs expire in 3600 seconds (1 hour) — hardcode this; do not add configurable expiry until a real requirement exists (YAGNI).

---

## File Structure

```
microloans/
├── api/
│   ├── .dev.vars                      # gitignored: JWT_SECRET, TURNSTILE_SECRET for local/test
│   ├── src/
│   │   ├── index.ts                   # MODIFIED: mounts /api/auth, imports shared Bindings/Variables
│   │   ├── types.ts                   # NEW: shared Bindings + Variables types (DRY — was duplicated in index.ts/health.ts)
│   │   ├── routes/
│   │   │   ├── health.ts              # MODIFIED: imports shared Bindings type instead of local copy
│   │   │   └── auth.ts                # NEW: POST /register, /login, /logout
│   │   ├── middleware/
│   │   │   ├── turnstile.ts           # NEW: verifyTurnstile(token, secret)
│   │   │   └── requireAuth.ts         # NEW: Hono middleware, JWT + KV blacklist check
│   │   └── auth/
│   │       ├── password.ts            # NEW: hashPassword, verifyPassword (PBKDF2)
│   │       └── jwt.ts                 # NEW: signJwt, verifyJwt (HMAC-SHA256)
│   └── test/
│       ├── password.spec.ts           # NEW
│       ├── jwt.spec.ts                # NEW
│       ├── turnstile.spec.ts          # NEW
│       └── auth.spec.ts               # NEW: integration tests for register/login/logout
```

- `auth/` holds pure crypto logic with zero Cloudflare bindings — testable as plain unit tests, reusable later by the `pii-encryption` plan's pattern (separate module per crypto concern).
- `middleware/` holds anything that runs as a Hono middleware (`requireAuth`) or is called from one (`turnstile`), keeping `routes/auth.ts` itself thin.
- `types.ts` is introduced now because a second route group (`auth`) makes the duplicated `Bindings` type in `index.ts`/`health.ts` an actual DRY violation, not just a hypothetical one.

---

## Task 1: Shared Bindings/Variables Types + Password Hashing

**Files:**
- Create: `api/src/types.ts`
- Modify: `api/src/index.ts`
- Modify: `api/src/routes/health.ts`
- Create: `api/src/auth/password.ts`
- Test: `api/test/password.spec.ts`

**Interfaces:**
- Produces: `Bindings` type (`{ DB: D1Database; LOAN_CACHE: KVNamespace; KYC_BUCKET: R2Bucket; AI: Ai; JWT_SECRET: string; TURNSTILE_SECRET: string }`) and `Variables` type (`{ userId: string; role: "borrower" | "officer" | "admin"; jti: string; exp: number }`) from `api/src/types.ts` — every later task and plan imports these instead of redefining bindings locally.
- Produces: `hashPassword(password: string): Promise<string>` and `verifyPassword(password: string, stored: string): Promise<boolean>` from `api/src/auth/password.ts` — consumed by Task 4 (register) and Task 5 (login).

- [ ] **Step 1: Create `api/src/types.ts`**

```typescript
export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  KYC_BUCKET: R2Bucket;
  AI: Ai;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
```

- [ ] **Step 2: Update `api/src/routes/health.ts` to use the shared type**

```typescript
import { Hono } from "hono";
import type { Bindings } from "../types";

const health = new Hono<{ Bindings: Bindings }>();

health.get("/", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", db: "connected" });
});

export default health;
```

- [ ] **Step 3: Update `api/src/index.ts` to use the shared type**

```typescript
import { Hono } from "hono";
import health from "./routes/health";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);

export default app;
```

- [ ] **Step 4: Run the existing test suite to confirm the refactor didn't break anything**

Run: `npm test --prefix api`
Expected: PASS — `GET /api/health > returns ok status and confirms DB connectivity` (unchanged behavior).

- [ ] **Step 5: Write the failing test for password hashing**

```typescript
// api/test/password.spec.ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password";

describe("password hashing", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time due to random salt", async () => {
    const hashA = await hashPassword("same-password");
    const hashB = await hashPassword("same-password");
    expect(hashA).not.toEqual(hashB);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/auth/password'`.

- [ ] **Step 7: Implement `api/src/auth/password.ts`**

```typescript
const PBKDF2_ITERATIONS = 100_000;

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(password, salt);
  return `${bufferToHex(salt)}:${bufferToHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = hexToBuffer(saltHex);
  const derived = await deriveBits(password, salt);
  return bufferToHex(derived) === hashHex;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — all 3 tests in `password.spec.ts`, plus the unchanged `health.spec.ts`.

- [ ] **Step 9: Commit**

```bash
git add api/src/types.ts api/src/index.ts api/src/routes/health.ts api/src/auth/password.ts api/test/password.spec.ts
git commit -m "feat: add shared bindings types and PBKDF2 password hashing"
```

---

## Task 2: JWT Sign & Verify

**Files:**
- Create: `api/src/auth/jwt.ts`
- Test: `api/test/jwt.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure Web Crypto, no bindings).
- Produces: `JwtPayload` type (`{ sub: string; role: "borrower" | "officer" | "admin"; jti: string; exp: number }`), `signJwt(payload: { sub: string; role: JwtPayload["role"] }, secret: string, expiresInSeconds: number): Promise<string>`, and `verifyJwt(token: string, secret: string): Promise<JwtPayload>` (throws on bad signature or expiry) — consumed by Task 5 (login issues a token) and Task 6 (`requireAuth` verifies it).

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/jwt.spec.ts
import { describe, expect, it, vi } from "vitest";
import { signJwt, verifyJwt } from "../src/auth/jwt";

describe("jwt sign and verify", () => {
  it("round-trips a valid token", async () => {
    const token = await signJwt({ sub: "user-123", role: "borrower" }, "test-secret", 3600);
    const payload = await verifyJwt(token, "test-secret");

    expect(payload.sub).toBe("user-123");
    expect(payload.role).toBe("borrower");
    expect(typeof payload.jti).toBe("string");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signJwt({ sub: "user-123", role: "borrower" }, "secret-a", 3600);
    await expect(verifyJwt(token, "secret-b")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const token = await signJwt({ sub: "user-123", role: "borrower" }, "test-secret", 1);
    vi.advanceTimersByTime(2000);
    await expect(verifyJwt(token, "test-secret")).rejects.toThrow("Token expired");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/auth/jwt'`.

- [ ] **Step 3: Implement `api/src/auth/jwt.ts`**

```typescript
export type JwtPayload = {
  sub: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};

function base64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(String.fromCharCode(...new Uint8Array(signature)));
}

export async function signJwt(
  payload: { sub: string; role: JwtPayload["role"] },
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const fullPayload: JwtPayload = {
    ...payload,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(fullPayload))}`;
  const signature = await hmacSign(data, secret);
  return `${data}.${signature}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed token");
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
  if (signature !== expectedSignature) {
    throw new Error("Invalid signature");
  }
  const payload: JwtPayload = JSON.parse(base64urlDecode(encodedPayload));
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return payload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — all 3 tests in `jwt.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add api/src/auth/jwt.ts api/test/jwt.spec.ts
git commit -m "feat: add HMAC-SHA256 JWT sign and verify"
```

---

## Task 3: Turnstile Verification Helper

**Files:**
- Create: `api/src/middleware/turnstile.ts`
- Test: `api/test/turnstile.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (calls Cloudflare's real `siteverify` API over `fetch`).
- Produces: `verifyTurnstile(token: string, secret: string): Promise<boolean>` — consumed by Task 4 (register) and Task 5 (login).

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/turnstile.spec.ts
import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../src/middleware/turnstile";

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA";
const ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000000AA";

describe("verifyTurnstile", () => {
  it("returns true for Cloudflare's always-pass test secret", async () => {
    await expect(verifyTurnstile(DUMMY_TOKEN, ALWAYS_PASS_SECRET)).resolves.toBe(true);
  });

  it("returns false for Cloudflare's always-fail test secret", async () => {
    await expect(verifyTurnstile(DUMMY_TOKEN, ALWAYS_FAIL_SECRET)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/middleware/turnstile'`.

- [ ] **Step 3: Implement `api/src/middleware/turnstile.ts`**

```typescript
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);

  const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
  const outcome = await res.json<{ success: boolean }>();
  return outcome.success;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both tests in `turnstile.spec.ts`. (This makes a real network call to Cloudflare; if it fails with a network error rather than an assertion error, check connectivity before assuming a code bug.)

- [ ] **Step 5: Commit**

```bash
git add api/src/middleware/turnstile.ts api/test/turnstile.spec.ts
git commit -m "feat: add Turnstile siteverify helper"
```

---

## Task 4: POST /api/auth/register

**Files:**
- Create: `api/src/routes/auth.ts`
- Modify: `api/src/index.ts`
- Create: `api/.dev.vars`
- Test: `api/test/auth.spec.ts`

**Interfaces:**
- Consumes: `Bindings`/`Variables` (Task 1), `hashPassword` (Task 1), `verifyTurnstile` (Task 3).
- Produces: `auth` Hono sub-app exported from `api/src/routes/auth.ts`, mounted at `/api/auth` — Task 5 and Task 6 add more routes to this same file/sub-app.

- [ ] **Step 1: Create `api/.dev.vars` (gitignored — do not commit)**

```
JWT_SECRET=local-dev-jwt-secret-change-me
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

- [ ] **Step 2: Write the failing test**

```typescript
// api/test/auth.spec.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

describe("POST /api/auth/register", () => {
  it("creates a new borrower and returns 201", async () => {
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new-borrower@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("new-borrower@example.com");
    expect(typeof body.id).toBe("string");
  });

  it("rejects a duplicate email with 409", async () => {
    const payload = {
      email: "duplicate@example.com",
      password: "correct-horse-battery-staple",
      turnstileToken: DUMMY_TOKEN,
    };
    await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      env
    );
    const second = await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      env
    );

    expect(second.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — `Cannot find module '../src/routes/auth'`.

- [ ] **Step 4: Implement `api/src/routes/auth.ts`**

```typescript
import { Hono } from "hono";
import { hashPassword } from "../auth/password";
import { verifyTurnstile } from "../middleware/turnstile";
import type { Bindings, Variables } from "../types";

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(body.email)
    .first();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'borrower')"
  )
    .bind(id, body.email, passwordHash)
    .run();

  return c.json({ id, email: body.email }, 201);
});

export default auth;
```

- [ ] **Step 5: Mount the auth sub-app in `api/src/index.ts`**

```typescript
import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);

export default app;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both tests in `auth.spec.ts`, plus all earlier test files.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/auth.ts api/src/index.ts api/test/auth.spec.ts
git commit -m "feat: add POST /api/auth/register"
```

(`.dev.vars` is gitignored per the Foundation plan's `.gitignore` — confirm with `git status` that it does not appear before continuing.)

---

## Task 5: POST /api/auth/login

**Files:**
- Modify: `api/src/routes/auth.ts`
- Modify: `api/test/auth.spec.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 1), `signJwt` (Task 2), `verifyTurnstile` (Task 3), the `/register` route already in this file (Task 4) to set up fixtures in tests.
- Produces: `POST /api/auth/login` returning `{ token: string }` on success — consumed by Task 6's logout test and by the `loan-and-ledger-core` plan's authenticated requests.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/auth.spec.ts — add to the existing file
describe("POST /api/auth/login", () => {
  it("returns a JWT for correct credentials", async () => {
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login-test@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login-test@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".")).toHaveLength(3);
  });

  it("returns 401 for wrong password", async () => {
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong-pw@example.com",
          password: "correct-horse-battery-staple",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong-pw@example.com",
          password: "totally-wrong",
          turnstileToken: DUMMY_TOKEN,
        }),
      },
      env
    );

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — 404 (no `/login` route registered yet), assertion `expect(res.status).toBe(200)` fails.

- [ ] **Step 3: Add the `/login` route to `api/src/routes/auth.ts`**

```typescript
// add these imports at the top of api/src/routes/auth.ts
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";

// add below the /register handler, still inside the same file
auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, role FROM users WHERE email = ?"
  )
    .bind(body.email)
    .first<{ id: string; password_hash: string; role: "borrower" | "officer" | "admin" }>();

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signJwt({ sub: user.id, role: user.role }, c.env.JWT_SECRET, 3600);
  return c.json({ token });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both new tests, plus all earlier tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/auth.ts api/test/auth.spec.ts
git commit -m "feat: add POST /api/auth/login"
```

---

## Task 6: requireAuth Middleware + POST /api/auth/logout (KV Blacklist)

**Files:**
- Create: `api/src/middleware/requireAuth.ts`
- Modify: `api/src/routes/auth.ts`
- Modify: `api/test/auth.spec.ts`

**Interfaces:**
- Consumes: `verifyJwt` (Task 2), `Bindings`/`Variables` (Task 1).
- Produces: `requireAuth` Hono middleware from `api/src/middleware/requireAuth.ts` (sets `c.var.userId`, `c.var.role`, `c.var.jti`, `c.var.exp` on success, returns 401 otherwise) — consumed by `POST /api/auth/logout` here, and by every protected route in the `loan-and-ledger-core` plan.

- [ ] **Step 1: Write the failing test**

```typescript
// api/test/auth.spec.ts — add to the existing file
describe("POST /api/auth/logout", () => {
  async function registerAndLogin(email: string): Promise<string> {
    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "correct-horse-battery-staple", turnstileToken: DUMMY_TOKEN }),
      },
      env
    );
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "correct-horse-battery-staple", turnstileToken: DUMMY_TOKEN }),
      },
      env
    );
    const { token } = await loginRes.json<{ token: string }>();
    return token;
  }

  it("revokes the token so it can no longer be used", async () => {
    const token = await registerAndLogin("logout-test@example.com");

    const logoutRes = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      env
    );
    expect(logoutRes.status).toBe(200);

    const secondLogoutRes = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      env
    );
    expect(secondLogoutRes.status).toBe(401);
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await app.request("/api/auth/logout", { method: "POST" }, env);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix api`
Expected: FAIL — 404 (no `/logout` route registered yet).

- [ ] **Step 3: Implement `api/src/middleware/requireAuth.ts`**

```typescript
import type { Context, Next } from "hono";
import { verifyJwt } from "../auth/jwt";
import type { Bindings, Variables } from "../types";

export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing token" }, 401);
  }
  const token = header.slice("Bearer ".length);

  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    const blacklisted = await c.env.LOAN_CACHE.get(`blacklist:${payload.jti}`);
    if (blacklisted) {
      return c.json({ error: "Token revoked" }, 401);
    }

    c.set("userId", payload.sub);
    c.set("role", payload.role);
    c.set("jti", payload.jti);
    c.set("exp", payload.exp);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
```

- [ ] **Step 4: Add the `/logout` route to `api/src/routes/auth.ts`**

```typescript
// add this import at the top of api/src/routes/auth.ts
import { requireAuth } from "../middleware/requireAuth";

// add below the /login handler, still inside the same file
auth.post("/logout", requireAuth, async (c) => {
  const jti = c.var.jti;
  const exp = c.var.exp;
  const ttl = exp - Math.floor(Date.now() / 1000);

  if (ttl > 0) {
    await c.env.LOAN_CACHE.put(`blacklist:${jti}`, "1", { expirationTtl: ttl });
  }

  return c.json({ ok: true });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix api`
Expected: PASS — both new tests, plus the full suite (`health`, `password`, `jwt`, `turnstile`, `auth` — register/login/logout).

- [ ] **Step 6: Commit**

```bash
git add api/src/middleware/requireAuth.ts api/src/routes/auth.ts api/test/auth.spec.ts
git commit -m "feat: add requireAuth middleware and POST /api/auth/logout"
```

---

## Task 7: Wrangler Dev Smoke Test (Full Register → Login → Logout Flow)

**Files:**
- Modify: none (verification-only task)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: confirmation that the full auth flow works under the real `wrangler dev` process, with real local D1 and KV — the gate before the `loan-and-ledger-core` plan builds protected endpoints on top of `requireAuth`.

- [ ] **Step 1: Confirm `api/.dev.vars` exists with `JWT_SECRET` and `TURNSTILE_SECRET`**

Run: `cat api/.dev.vars`
Expected: two lines, `JWT_SECRET=...` and `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`. If missing, re-create it per Task 4 Step 1 — `wrangler dev` reads it the same way the test runner does.

- [ ] **Step 2: Start the dev server**

Run: `npx wrangler dev --local`
Expected: `Ready on http://localhost:8787`, no binding or env var errors.

- [ ] **Step 3: Register a user**

Run:
```bash
curl -s -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'
```
Expected: `{"id":"<uuid>","email":"smoke-test@example.com"}`, HTTP 201.

- [ ] **Step 4: Log in and capture the token**

Run:
```bash
curl -s -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com","password":"correct-horse-battery-staple","turnstileToken":"XXXX.DUMMY.TOKEN.XXXX"}'
```
Expected: `{"token":"<header>.<payload>.<signature>"}`, HTTP 200.

- [ ] **Step 5: Log out with the captured token**

Run (substitute the real token from Step 4):
```bash
curl -s -i -X POST http://localhost:8787/api/auth/logout \
  -H "Authorization: Bearer <token>"
```
Expected: `HTTP/1.1 200`, body `{"ok":true}`.

- [ ] **Step 6: Confirm the logged-out token is now rejected**

Run the same `curl` command from Step 5 again with the same token.
Expected: `HTTP/1.1 401`, body `{"error":"Token revoked"}`.

- [ ] **Step 7: Stop the dev server**

Press `Ctrl+C` in the terminal running `wrangler dev`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-06-25-auth-and-sessions.md
git commit -m "docs: mark auth-and-sessions plan verified end-to-end via wrangler dev"
```

---

## Self-Review Notes

- **Spec coverage:** Tasks 1–7 cover CLOUDFLARE_MICROLOAN_PLAN.md §2's Workers/KV/Turnstile rows (JWT auth, KV blacklist, Turnstile on registration/login) and §4.C.3 (Turnstile client protection). PII encryption (§4.C.1) and Zero Trust admin SSO (§4.C.2) are explicitly out of scope — covered by the `pii-encryption` and `admin-and-zero-trust` plans respectively.
- **Placeholder scan:** no TBD/TODO markers; every step has literal file contents, exact `curl`/`npm` commands, and expected output.
- **Type consistency:** `Bindings`/`Variables` defined once in Task 1's `types.ts` and imported (never redefined) in `health.ts`, `index.ts`, `auth.ts`, and `requireAuth.ts`. `JwtPayload.role` and `Variables.role` both use the literal union `"borrower" | "officer" | "admin"` matching the D1 `users.role` CHECK constraint. `signJwt`'s first parameter type and `JwtPayload` are consistent between `jwt.ts` (Task 2) and every call site in `auth.ts` (Task 5).
