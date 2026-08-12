# Swiss Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Swiss Industrial Print design system (Tailwind tokens, global styles, four reusable primitives) and apply it to the app shell (Login, Nav) so every later page-build phase has a consistent, already-verified visual language to build on.

**Architecture:** Design tokens live in `tailwind.config.js` (colors, fonts, zeroed border-radius scale) and `src/index.css` (base layer + a `grid-lines` utility for the gap-based divider technique). Four primitives (`Button`, `Field`, `Panel`, `Badge`) in `src/components/ui/` wrap raw HTML with the Swiss Industrial Print styling rules from the `industrial-brutalist-ui` skill (§2.1, §3, §4, §6). `LoginPage` and `Nav` are rewritten to consume the primitives — no other page changes in this phase.

**Tech Stack:** React 19, Tailwind CSS 3, Vite. Fonts loaded via Google Fonts `<link>` (Archivo Black for macro display type, IBM Plex Mono for micro/data type, Inter for body copy) — no new npm dependencies.

## Global Constraints

- Archetype: **Swiss Industrial Print only** (light substrate `#F4F4F0` paper / `#111111` ink / `#E61919` hazard-red accent). Do not introduce the Tactical Telemetry dark-mode archetype — the two must not mix (`industrial-brutalist-ui` skill §2).
- Border-radius is zeroed globally in `tailwind.config.js` so no page can accidentally round a corner (skill §5, "Absolute rejection of `border-radius`").
- Macro headings use `font-display` (Archivo Black), uppercase, tight/negative tracking, `clamp()` sizing. Metadata/labels/nav use `font-mono` (IBM Plex Mono), uppercase, wide tracking. Body copy uses `font-sans` (Inter). (skill §3)
- Frontend has **no test runner configured** (confirmed: no `*.test.*`/`*.spec.*` files, no vitest in `frontend/package.json`). Verification for every task in this plan is `cd frontend && npm run build` (tsc typecheck + vite build), matching the convention already used in `docs/superpowers/plans/2026-07-01-onboarding-wizard.md` tasks 4–8. Do not add a frontend test framework as part of this plan — out of scope.
- No new npm dependencies. Fonts are loaded via a Google Fonts `<link>` in `index.html`, not installed.
- These tokens and primitives are the foundation for every later phase (Dashboard/LoanDetail/Profile, Officer reskin, Documents/Notifications, Admin section) — later plans must reuse them rather than inventing parallel styling.

---

## Roadmap (for context — only Phase 1 is planned in detail here)

1. **Phase 1 (this plan): Design system foundation + app shell** — tokens, primitives, Login, Nav.
2. **Phase 2: Borrower core** — Dashboard reskin, new `LoanDetailPage` (`/loans/:id`), new `ProfilePage` (`/profile`), generalized `PaymentModal`.
3. **Phase 3: Officer reskin** — apply the design system to the existing `OfficerPage`; no functional changes.
4. **Phase 4: Documents + Notifications** — `DocumentsPage`, `NotificationsPage`, `NotificationBell`; requires new backend endpoints (`GET /documents`, notification storage) — backend work included in that plan.
5. **Phase 5: Admin section** — `/admin/users`, `/admin/audit`, `/admin/portfolio`, `/admin/settings`; requires new backend endpoints for user management, system-wide audit, portfolio stats, and config storage.

Each phase gets its own plan file once the prior phase is merged, per the `writing-plans` scope-check rule (independent, separately testable subsystems).

---

### Task 1: Tailwind tokens + Google Fonts

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/index.html`

**Interfaces:**
- Produces: Tailwind theme tokens available to every later task — colors `paper`, `paper-2`, `ink`, `hazard`; `fontFamily.display`, `fontFamily.mono`, `fontFamily.sans`; `letterSpacing.tightest`, `letterSpacing.wide2`; a fully zeroed `borderRadius` scale.

- [ ] **Step 1: Replace `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    borderRadius: {
      none: "0px",
      sm: "0px",
      DEFAULT: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "0px",
    },
    extend: {
      colors: {
        paper: "#F4F4F0",
        "paper-2": "#EAE8E3",
        ink: "#111111",
        hazard: "#E61919",
      },
      fontFamily: {
        display: ['"Archivo Black"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        wide2: "0.08em",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Replace `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>Microloans</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no errors (nothing consumes the new tokens yet, so output is unchanged visually).

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.js frontend/index.html
git commit -m "feat: add Swiss Industrial Print design tokens and fonts"
```

---

### Task 2: Global base styles

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: base `body` styling (paper background, ink text, Inter font), a `.grid-lines` utility class (1px-gap grid divider technique per `industrial-brutalist-ui` skill §8.1) for later phases' table/card grids.

- [ ] **Step 1: Replace `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-paper text-ink font-sans antialiased;
  }
  ::selection {
    background-color: #e61919;
    color: #f4f4f0;
  }
}

@layer utilities {
  .grid-lines {
    display: grid;
    gap: 1px;
    background-color: theme("colors.ink");
  }
  .grid-lines > * {
    background-color: theme("colors.paper");
  }
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add Swiss Industrial Print base styles and grid-lines utility"
```

---

### Task 3: `Button` primitive

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`

**Interfaces:**
- Produces: `<Button variant?: "primary" | "secondary" | "hazard" ...ButtonHTMLAttributes>` — default variant `"primary"`. Consumed by Task 7 (LoginPage) and Task 8 (Nav), and every later phase.

- [ ] **Step 1: Create `frontend/src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "hazard";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-ink text-paper border border-ink hover:bg-paper hover:text-ink",
  secondary: "bg-paper text-ink border border-ink hover:bg-ink hover:text-paper",
  hazard: "bg-hazard text-paper border border-hazard hover:bg-paper hover:text-hazard",
};

export default function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`font-mono text-xs font-semibold uppercase tracking-wide2 px-4 py-2 transition-colors disabled:opacity-40 disabled:pointer-events-none ${variantClass[variant]} ${className}`}
    />
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no errors (unused-export warning, if any, is OK — nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Button.tsx
git commit -m "feat: add Button primitive"
```

---

### Task 4: `Field` primitive

**Files:**
- Create: `frontend/src/components/ui/Field.tsx`

**Interfaces:**
- Produces: `<Field label: string, type?: string, value: string, onChange: (value: string) => void, required?: boolean, placeholder?: string, autoComplete?: string>`. Consumed by Task 7 (LoginPage) and every later form.

- [ ] **Step 1: Create `frontend/src/components/ui/Field.tsx`**

```tsx
interface FieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}

export default function Field({
  label,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
  autoComplete,
}: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wide2 text-ink/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="border border-ink bg-paper px-3 py-2 text-sm font-sans focus:outline-none focus:bg-paper-2"
      />
    </label>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Field.tsx
git commit -m "feat: add Field primitive"
```

---

### Task 5: `Panel` primitive

**Files:**
- Create: `frontend/src/components/ui/Panel.tsx`

**Interfaces:**
- Produces: `<Panel title?: string, className?: string, children: ReactNode>`. Consumed by Task 7 (LoginPage) and every later bordered container.

- [ ] **Step 1: Create `frontend/src/components/ui/Panel.tsx`**

```tsx
import type { ReactNode } from "react";

interface Props {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function Panel({ title, children, className = "" }: Props) {
  return (
    <div className={`border border-ink bg-paper ${className}`}>
      {title && (
        <div className="border-b border-ink px-4 py-2">
          <span className="font-mono text-[11px] uppercase tracking-wide2 text-ink">
            [ {title} ]
          </span>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Panel.tsx
git commit -m "feat: add Panel primitive"
```

---

### Task 6: `Badge` primitive

**Files:**
- Create: `frontend/src/components/ui/Badge.tsx`

**Interfaces:**
- Produces: `<Badge tone?: "neutral" | "success" | "danger", children: string>` — default tone `"neutral"`. Consumed by Task 8 (Nav, role tag) and every later status pill (loan status, KYC status).

- [ ] **Step 1: Create `frontend/src/components/ui/Badge.tsx`**

```tsx
type Tone = "neutral" | "success" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "border-ink text-ink",
  success: "border-ink text-ink bg-paper-2",
  danger: "border-hazard text-hazard",
};

export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: string;
}) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide2 ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Badge.tsx
git commit -m "feat: add Badge primitive"
```

---

### Task 7: Reskin `LoginPage`

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `Field` (Task 4), `Button` (Task 3), `Panel` (Task 5).
- No change to component's external behavior — same `handleSubmit` logic, same navigation rules.

- [ ] **Step 1: Replace `frontend/src/pages/LoginPage.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../App";
import Field from "../components/ui/Field";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";

const turnstileToken = import.meta.env.VITE_TURNSTILE_TOKEN || "1x00000000000000000000AA";
if (!turnstileToken) {
  throw new Error("VITE_TURNSTILE_TOKEN is required in the repo-root .env file");
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "register") {
      const { error: err } = await api.POST("/auth/register", {
        body: { email, password, turnstileToken },
      });
      if (err) {
        setError("error" in err ? err.error : "Registration failed");
        return;
      }
    }

    const { data, error: err } = await api.POST("/auth/login", {
      body: { email, password, turnstileToken },
    });
    if (err || !data) {
      setError("error" in (err ?? {}) ? (err as { error: string }).error : "Login failed");
      return;
    }

    const me = await login(data.token);
    if (!me) return;
    if (me.role === "officer" || me.role === "admin") {
      navigate("/officer");
    } else if (!localStorage.getItem("onboarding_shown")) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-center border-b border-ink p-8 md:border-b-0 md:border-r">
        <p className="font-mono text-xs uppercase tracking-wide2 text-ink/60">
          MCL / 01 // ACCESS TERMINAL
        </p>
        <h1 className="font-display uppercase leading-[0.9] tracking-tightest text-[clamp(3rem,9vw,7rem)]">
          Micro
          <br />
          Loans<span className="text-hazard">®</span>
        </h1>
      </div>

      <div className="flex items-center justify-center p-8">
        <Panel title={mode === "login" ? "Login" : "Register"} className="w-full max-w-sm">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field label="Email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {error && (
              <p className="border border-hazard bg-paper px-3 py-2 font-mono text-xs text-hazard">
                {error}
              </p>
            )}
            <Button type="submit">{mode === "login" ? "Login" : "Register"}</Button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setError("");
            }}
            className="mt-4 font-mono text-xs uppercase tracking-wide2 underline"
          >
            {mode === "login" ? "No account? Register" : "Have an account? Login"}
          </button>
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: reskin LoginPage with Swiss Industrial Print primitives"
```

---

### Task 8: Reskin `Nav`

**Files:**
- Modify: `frontend/src/components/Nav.tsx`

**Interfaces:**
- Consumes: `Badge` (Task 6), `Button` (Task 3).
- No change to `useAuth()` usage or route links — same destinations as today.

- [ ] **Step 1: Replace `frontend/src/components/Nav.tsx`**

```tsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import Badge from "./ui/Badge";
import Button from "./ui/Button";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <nav className="grid grid-cols-[auto_1fr_auto_auto_auto] items-stretch divide-x divide-ink border-b-2 border-ink bg-paper">
      <Link
        to="/dashboard"
        className="flex items-center px-4 py-3 font-display text-lg uppercase tracking-tightest"
      >
        MCL<span className="text-hazard">®</span>
      </Link>
      <div className="flex items-center gap-4 px-4 py-3 font-mono text-xs uppercase tracking-wide2">
        <Link to="/dashboard" className="hover:text-hazard">
          Dashboard
        </Link>
        <Link to="/kyc" className="hover:text-hazard">
          KYC
        </Link>
        {(user.role === "officer" || user.role === "admin") && (
          <Link to="/officer" className="hover:text-hazard">
            Officer Panel
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <Badge>{user.role}</Badge>
        <span className="font-mono text-xs text-ink/70">{user.email}</span>
      </div>
      <div className="flex items-center px-4 py-3">
        <Button variant="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Nav.tsx
git commit -m "feat: reskin Nav with Swiss Industrial Print primitives"
```

---

### Task 9: Full-shell smoke test

**Files:** none (verification only, no commit)

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Visually verify in a browser**

Open the printed local URL and confirm:
- `/login` shows the two-column layout: giant uppercase "MICRO LOANS®" display heading (left) in Archivo Black, bordered login `Panel` (right) with monospace labels and a solid `Button`.
- No rounded corners anywhere on the page.
- After logging in, `Nav` renders as a bordered bar with divider lines between the logo, links, role badge + email, and logout button — no layout overlap at common desktop widths (1280px, 1440px).
- Browser console has no errors.

- [ ] **Step 3: Stop the dev server**

No commit — this task only confirms Tasks 1–8 integrate correctly.
