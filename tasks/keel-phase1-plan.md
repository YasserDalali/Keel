# Keel frontend (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `frontend/` from zero as the Keel design system, landing page and sign-in/create-account pages described in `tasks/keel-design-spec.md`.

**Architecture:** Vite SPA with Tailwind v4 tokens in one CSS file, seven small UI primitives, one marketing page composed of section components, and two auth pages over the existing Worker API (`/api/*`, proxied in dev). Motion is GSAP + ScrollTrigger + SplitText with Lenis smooth scroll, all switched off under `prefers-reduced-motion`.

**Tech Stack:** Vite 8, React 19, TypeScript 5.9, Tailwind CSS 4, gsap 3.15 + @gsap/react 2, lenis 1.3, react-router 8, openapi-fetch + openapi-typescript, vitest.

**Deliberate deviation from the plan template:** this is visual work, so the source of truth for layout, copy, sizes and timings is the spec. Tasks give full code for logic (loan maths, API, auth, motion bootstrap, config) and exact contracts + acceptance checks for visual components instead of pre-writing every JSX line twice.

## Global Constraints

- Spec: `tasks/keel-design-spec.md` — tokens (§1), primitives (§2), sections and copy (§3), auth (§4). Copy is used verbatim.
- Art: `frontend/public/img/*.webp` already exists (12 files). Do not regenerate.
- Font: General Sans 400/500/600 via `<link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap">`. ponytail: CDN link; self-host the woff2 if the third-party request matters.
- No pill shapes, no badges, no coloured side borders, no placeholder text in inputs, no emoji, no default `ease`/`linear` easing.
- Only `transform`, `opacity`, `clip-path` animate. Every animation has a reduced-motion path.
- Money uses `tabular-nums`. Amounts in USD, formatted with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`.
- `api/` is not modified. Root `npm test` must still pass.
- Commit after each task **only if the user has OK'd commits** (CLAUDE.md: commit only when asked). Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Visual check after every visual task: browser pane at 1440×900 and 375×812, no horizontal scroll.

## File map

```
frontend/
  package.json  vite.config.ts  tsconfig.json  index.html
  public/img/*.webp                       (done)
  public/favicon.svg
  src/
    main.tsx                              router + providers
    styles/tokens.css                     @theme tokens, base, ::selection, focus
    lib/loan-terms.ts (+ .test.ts)        rate constants + quote()
    lib/format.ts                         usd()
    lib/api.ts  lib/api-types.ts          openapi-fetch client (types generated)
    lib/auth.tsx                          AuthProvider, useAuth, RequireAuth
    lib/motion.ts                         gsap registration, Lenis, useReducedMotion, eases
    ui/Button.tsx TextField.tsx TextLink.tsx Container.tsx Art.tsx Stat.tsx Wordmark.tsx
    ui/Nav.tsx  ui/Footer.tsx
    marketing/LandingPage.tsx content.ts
    marketing/Hero.tsx Diorama.tsx WhoBorrows.tsx HowItWorks.tsx Calculator.tsx Trust.tsx Testimonial.tsx FinalCta.tsx
    auth/AuthLayout.tsx SignInPage.tsx SignUpPage.tsx authErrors.ts
    app/AppHome.tsx                       bare /app
    system/SystemPage.tsx                 /system — living reference of tokens + primitives
```

---

### Task 1: Scaffold + tokens + loan maths

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/styles/tokens.css`, `frontend/src/lib/loan-terms.ts`, `frontend/src/lib/loan-terms.test.ts`, `frontend/src/lib/format.ts`

**Interfaces:**
- Produces: `quote(amount: number, termMonths: number): { fee: number; total: number; monthly: number; upfront: number }`, constants `FLAT_RATE`, `UPFRONT_THRESHOLD`, `UPFRONT_PCT`, `MIN_AMOUNT=500`, `MAX_AMOUNT=10000`, `MIN_TERM=3`, `MAX_TERM=24`; `usd(n: number): string`; Tailwind utilities from tokens (`bg-canvas`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `bg-surface`, `bg-accent-600`, `bg-mint-50`, `text-display`, `text-h1`…`text-label`, `shadow-float-1/2`, `ease-out-expo`, `ease-in-out-expo`).

- [ ] **Step 1: package.json**

```json
{
  "name": "keel-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "test": "vitest run",
    "gen:types": "openapi-typescript ../api/openapi.json -o src/lib/api-types.ts"
  },
  "dependencies": {
    "@gsap/react": "^2.1.2",
    "gsap": "^3.15.1",
    "lenis": "^1.3.27",
    "openapi-fetch": "^0.17.0",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "react-router": "^8.5.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.3.0",
    "openapi-typescript": "^7.13.0",
    "tailwindcss": "^4.3.5",
    "typescript": "~5.9.0",
    "vite": "^8.3.8",
    "vitest": "^5.1.0"
  }
}
```
Run `cd frontend && npm install`. If `react-router@8` removed the APIs used in Task 3 (`createBrowserRouter`, `RouterProvider`, `Link`, `Navigate`, `useNavigate`, `Outlet`), pin `^7` instead.

- [ ] **Step 2: vite.config.ts, tsconfig.json, index.html**

```ts
// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  test: { environment: "node" },
});
```

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "bundler", "jsx": "react-jsx",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "skipLibCheck": true, "types": ["vite/client"], "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`index.html`: `lang="en"`, viewport meta, `<title>Keel — small business loans</title>`, meta description "Loans from $500 to $10,000 for shops, workshops and market stalls.", Fontshare `<link rel="preconnect">` + stylesheet link from Global Constraints, `<link rel="icon" href="/favicon.svg">`, `<div id="root">`, module script `/src/main.tsx`.

- [ ] **Step 3: tokens.css** — `@import "tailwindcss";` then one `@theme` block with every token in spec §1 (colors incl. `--color-accent-50…900` built around `#1F7A4D`, `--font-sans: "General Sans", ui-sans-serif, sans-serif`, the type steps as `--text-*` with `--text-*--line-height` / `--text-*--letter-spacing`, `--shadow-float-1/2`, `--ease-out-expo`, `--ease-in-out-expo`, `--radius-control: 10px`, `--radius-art: 16px`). Base layer: `body { background: var(--color-canvas); color: var(--color-ink); font-feature-settings: "ss01"; -webkit-font-smoothing: antialiased }`, `::selection`, a global `:focus-visible` ring (2px accent-600, 2px offset, radius inherit), `.tabular { font-variant-numeric: tabular-nums }`, `h1,h2,h3 { text-wrap: balance }`, and `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 150ms !important } }`.

- [ ] **Step 4: Write the failing test**

```ts
// frontend/src/lib/loan-terms.test.ts
import { describe, expect, it } from "vitest";
import { quote } from "./loan-terms";

describe("quote", () => {
  it("adds a flat 5% fee and splits it monthly", () => {
    expect(quote(2400, 12)).toEqual({ fee: 120, total: 2520, monthly: 210, upfront: 0 });
  });
  it("rounds the monthly payment to cents like the API", () => {
    expect(quote(1000, 3).monthly).toBe(350);
    expect(quote(1000, 7).monthly).toBe(150);
    expect(quote(1234, 7).monthly).toBe(185.1);
  });
  it("asks 5% upfront only above $5,000", () => {
    expect(quote(5000, 10).upfront).toBe(0);
    expect(quote(6000, 10)).toEqual({ fee: 300, total: 6300, monthly: 630, upfront: 300 });
  });
});
```

- [ ] **Step 5: Run it, expect FAIL** — `cd frontend && npx vitest run src/lib/loan-terms.test.ts` → "Failed to resolve import ./loan-terms".

- [ ] **Step 6: Implement**

```ts
// frontend/src/lib/loan-terms.ts
// ponytail: mirrors LOAN_FLAT_INTEREST_RATE / LOAN_UPFRONT_* in .dev.vars; drifts if those change. Upgrade: serve them from GET /api/config.
export const FLAT_RATE = 0.05;
export const UPFRONT_THRESHOLD = 5000;
export const UPFRONT_PCT = 0.05;
export const MIN_AMOUNT = 500;
export const MAX_AMOUNT = 10_000;
export const MIN_TERM = 3;
export const MAX_TERM = 24;

const cents = (n: number) => Math.round(n * 100) / 100;

export function quote(amount: number, termMonths: number) {
  const total = cents(amount * (1 + FLAT_RATE));
  return {
    fee: cents(total - amount),
    total,
    monthly: cents(total / termMonths),
    upfront: amount > UPFRONT_THRESHOLD ? cents(amount * UPFRONT_PCT) : 0,
  };
}
```

```ts
// frontend/src/lib/format.ts
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const usd = (n: number) => (Number.isInteger(n) ? money : moneyCents).format(n);
```

- [ ] **Step 7: Run tests, expect PASS.** Then `src/main.tsx` renders a placeholder-free `<h1 className="text-display">Keel</h1>`; `npm run build` passes; open `npm run dev` in the browser pane and confirm General Sans + canvas colour load.

- [ ] **Step 8: Commit** (if OK'd) `feat(frontend): scaffold Keel with tokens and loan maths`.

---

### Task 2: Motion bootstrap + primitives + /system page

**Files:**
- Create: `src/lib/motion.ts`, `src/ui/{Button,TextField,TextLink,Container,Art,Stat,Wordmark}.tsx`, `src/system/SystemPage.tsx`, `public/favicon.svg`

**Interfaces:**
- Consumes: tokens (Task 1).
- Produces:
  - `motion.ts`: `gsap` (with `ScrollTrigger`, `SplitText` registered), `useGSAP` re-export, `EASE_OUT = "expo.out"`, `EASE_IN_OUT = "expo.inOut"`, `useReducedMotion(): boolean`, `useSmoothScroll(): void` (call once in the root layout).
  - `Button({ variant?: "primary"|"secondary"|"ghost", size?: "md"|"lg", loading?: boolean, to?: string, href?: string, ...buttonProps })` — renders `<Link>` when `to`, `<a>` when `href`, else `<button>`.
  - `TextField({ label: string, hint?: string, error?: string, ...inputProps })` — generates its id with `useId`.
  - `TextLink({ to?: string, href?: string, children })`.
  - `Container({ as?, className?, children })` — `mx-auto max-w-[1320px] px-6 lg:px-10`.
  - `Art({ src, alt, ratio: string /* e.g. "3/4" */, parallax?: number, reveal?: boolean, blend?: boolean, eager?: boolean, className? })`.
  - `Stat({ value: number, label: string, format: (n: number) => string })`.
  - `Wordmark({ className? })` — inline SVG "Keel", `fill="currentColor"`, `aria-label="Keel"`.

- [ ] **Step 1: motion.ts**

```ts
import { useEffect, useSyncExternalStore } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
export { gsap, ScrollTrigger, SplitText, useGSAP };
export const EASE_OUT = "expo.out";
export const EASE_IN_OUT = "expo.inOut";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
export const useReducedMotion = () => useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);

export function useSmoothScroll() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); lenis.destroy(); };
  }, [reduced]);
}
```

- [ ] **Step 2: Primitives** per spec §2. Contracts to hold:
  - Button primary: `bg-accent-600 text-canvas hover:bg-accent-700`, `rounded-[10px]`, `h-11 px-5` (md) / `h-14 px-7 text-body-lg` (lg), `transition-colors duration-150`. Pressed: `active:translate-y-px`. Loading: keeps width (label rendered `invisible`, three 6px dots absolutely centred pulsing with staggered `animation-delay`), `aria-busy`, `disabled`.
  - TextField: label `text-label text-ink-2` 8px above a `h-12 bg-surface border border-line rounded-[10px] px-4 text-body` input; hover `border-ink/20`; focus ring from tokens; hint/error 8px below in `text-small`; error sets `aria-invalid` + `aria-describedby` and `border-danger`. No `placeholder`.
  - TextLink: `bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-no-repeat bg-left-bottom hover:bg-[length:100%_1px] transition-[background-size] duration-250 ease-out-expo`.
  - Art: wrapper `relative overflow-hidden` with `style={{ aspectRatio: ratio }}`; `<img loading={eager ? "eager" : "lazy"} decoding="async">` absolutely filling, `object-cover`; `blend` adds `mix-blend-multiply` on the wrapper; `parallax` (when not reduced) → `useGSAP` tween `yPercent: (parallax - 1) * -40` scrubbed over the wrapper's viewport passage (`start: "top bottom", end: "bottom top", scrub: true`) on the `<img>` scaled 1.15 so edges never show; `reveal` → `clipPath` from `inset(100% 0 0 0)` to `inset(0% 0 0 0)` 900ms `EASE_OUT` on enter (`once: true`).
  - Stat: number counts from 0 on enter (`once`), 1200ms `EASE_OUT`, `tabular`; reduced motion shows final value.
  - Wordmark: hand-tuned SVG paths of "Keel" at General Sans 600, letter-spacing −0.03em, height 1em. favicon.svg: the "K" in ink on canvas, 32×32.

- [ ] **Step 3: SystemPage (`/system`)** — one page that renders: colour swatches with token name + hex, the type scale with each step's specs, spacing scale bars, both shadows, all Button variants/sizes/loading, TextField default/hint/error, TextLink, a Stat, an `Art` tile, the Wordmark. This is the living design-system reference.

- [ ] **Step 4: Verify** — `npm run typecheck && npm test`; browser pane `/system` at 1440 and 375; keyboard Tab through every control and see the focus ring; check reduced motion by temporarily making `useReducedMotion` return `true` and confirming Stat shows its final value with no tween (revert afterwards).

- [ ] **Step 5: Commit** (if OK'd) `feat(frontend): Keel primitives, motion bootstrap and /system reference`.

---

### Task 3: API client, auth, routes, sign-in and create-account

**Files:**
- Create: `src/lib/api-types.ts` (generated), `src/lib/api.ts`, `src/lib/auth.tsx`, `src/auth/{AuthLayout,SignInPage,SignUpPage}.tsx`, `src/auth/authErrors.ts`, `src/app/AppHome.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `Button`, `TextField`, `TextLink`, `Wordmark`, `Art`, `useSmoothScroll`.
- Produces: `api` (openapi-fetch client, baseUrl `/api`, bearer from `localStorage.token`), `AuthProvider`, `useAuth(): { user: Me | null; ready: boolean; signIn(email, password): Promise<void>; signUp(email, password): Promise<void>; signOut(): Promise<void> }` (throws `AuthError` with `.status`), `RequireAuth` route element. Routes: `/`, `/signin`, `/signup`, `/app` (guarded), `/system`, `*` → `/`.

- [ ] **Step 1:** `npm run gen:types`.

- [ ] **Step 2: api.ts**

```ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";

export const TOKEN_KEY = "token";
export const api = createClient<paths>({ baseUrl: "/api" });
api.use({
  onRequest({ request }) {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) request.headers.set("Authorization", `Bearer ${t}`);
    return request;
  },
});
```

- [ ] **Step 3: auth.tsx**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router";
import { api, TOKEN_KEY } from "./api";
import type { components } from "./api-types";

type Me = components["schemas"]["Me"];
// ponytail: always-pass token; only valid while TURNSTILE_SECRET is Cloudflare's test secret. Phase 2 renders the real widget.
const TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export class AuthError extends Error {
  constructor(public status: number) { super(`auth ${status}`); }
}

type Auth = {
  user: Me | null; ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  async function loadMe() {
    const { data } = await api.GET("/auth/me");
    setUser(data ?? null);
  }
  useEffect(() => {
    (localStorage.getItem(TOKEN_KEY) ? loadMe() : Promise.resolve()).finally(() => setReady(true));
  }, []);

  async function signIn(email: string, password: string) {
    const { data, response } = await api.POST("/auth/login", { body: { email, password, turnstileToken: TURNSTILE_TOKEN } });
    if (!data) throw new AuthError(response.status);
    localStorage.setItem(TOKEN_KEY, data.token);
    await loadMe();
  }
  async function signUp(email: string, password: string) {
    const { response } = await api.POST("/auth/register", { body: { email, password, turnstileToken: TURNSTILE_TOKEN } });
    if (!response.ok) throw new AuthError(response.status);
    await signIn(email, password);
  }
  async function signOut() {
    await api.POST("/auth/logout");
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }
  return <Ctx.Provider value={{ user, ready, signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

export function RequireAuth() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Outlet /> : <Navigate to="/signin" replace />;
}
```
If the generated schema names differ (`Me`, login body/response), adjust the type references to the generated names; do not hand-edit `api-types.ts`.
`fetch` rejecting (network down) surfaces as a thrown `TypeError` — callers map it to the network message.

- [ ] **Step 4: authErrors.ts** — `authMessage(err: unknown, mode: "signin" | "signup"): { field?: "email" | "password"; text: string; action?: { label: string; to: string } }` returning exactly the spec §4 strings: 401 → password field "That email and password don't match. Check both and try again."; 409 → email field "There's already an account with this email." + action "Sign in instead" → `/signin`; `TypeError` → "We couldn't reach Keel. Check your connection and try again."; anything else → "Something went wrong on our side. Try again in a minute." Add `authErrors.test.ts` covering 401, 409, TypeError (write test first, see it fail, implement, see it pass).

- [ ] **Step 5: AuthLayout + pages** per spec §4: 12-col grid ≥1024px (form in cols 1–5 centred with max-w-[400px], `auth-shop.webp` in cols 6–12 full height with `parallax 0.9`), Wordmark top-left linking `/`. Fields stagger in 60ms apart, 400ms `EASE_OUT` (reduced: none). Native validation: `type="email" required autoComplete="email"`, password `required minLength={8}` with `autoComplete` `current-password` / `new-password`. Submit shows `loading`. Successful auth → `navigate("/app")`. Already signed in on `/signin` or `/signup` → redirect `/app`.

- [ ] **Step 6: AppHome** — Container, Wordmark, "Signed in as {email}", Button secondary "Sign out" → `signOut()` then `/`.

- [ ] **Step 7: main.tsx** — `createBrowserRouter` with a root layout element that calls `useSmoothScroll()` and wraps `<AuthProvider>` around `<Outlet/>`; routes listed in Interfaces. `ScrollRestoration` on the root layout.

- [ ] **Step 8: Verify end-to-end** — terminal A: `npm run dev` at repo root (wrangler dev :8787, local D1 with migrations applied: `npx wrangler d1 migrations apply microloans_db --local`); terminal B: `cd frontend && npm run dev`. In the browser pane: create an account with a freshly generated test email and password (never repeated in chat), land on `/app`, sign out, sign in again, try a wrong password (see the 401 copy), try signing up twice (see the 409 copy), stop wrangler and submit (see the network copy).

- [ ] **Step 9: Commit** (if OK'd) `feat(frontend): sign-in, create-account and auth context`.

---

### Task 4: Nav + Footer

**Files:** Create `src/ui/Nav.tsx`, `src/ui/Footer.tsx`.

**Interfaces:** Consumes `Wordmark`, `Button`, `TextLink`, `Container`, `gsap`, `ScrollTrigger`. Produces `<Nav/>` and `<Footer/>` (used by LandingPage only; auth pages have their own header).

- [ ] **Step 1: Nav** per spec §2: fixed top, `h-16 lg:h-20`; links How it works → `#how`, Rates → `#rates`, Sign in → `/signin` (or "Your account" → `/app` when signed in); Apply → `/signup` (Button md primary). Hide/show via one `ScrollTrigger.create({ onUpdate: self => ... })` toggling `yPercent` -100/0 with 400ms `EASE_OUT`, only after 120px; background/border state after 24px via a class toggle. Mobile (<1024px): menu button (`aria-expanded`, `aria-controls`) opens a full-screen `bg-canvas` sheet with links at `text-h2`, staggered 60ms; Escape closes; body scroll locked while open (`lenis.stop()` is not reachable here — use `document.documentElement.style.overflow = "hidden"`). Anchor links scroll with native `scrollIntoView({ behavior: reduced ? "auto" : "smooth" })`.
- [ ] **Step 2: Footer** per spec §3.8: `border-t border-line`, Wordmark, two link columns that point only at pages that exist — Product [How it works → `#how`, Rates → `#rates`], Account [Sign in → `/signin`, Create account → `/signup`] — then the legal line "Keel is a demonstration lending platform." and `© {year} Keel`.
- [ ] **Step 3: Verify** on `/system` (temporarily render Nav there) at 1440/375: hide-on-scroll, sheet open/close via keyboard, focus returns to the menu button on close.
- [ ] **Step 4: Commit** (if OK'd).

---

### Task 5: Hero + diorama (signature parallax)

**Files:** Create `src/marketing/{LandingPage,content,Hero,Diorama}.tsx|ts`. Modify `src/main.tsx` route `/` → `LandingPage`.

**Interfaces:**
- `content.ts` produces `STATS: { value: number; label: string; format: "int" | "pct" | "hours" }[]`, `BORROWERS`, `TESTIMONIAL` (later tasks). STATS values are illustrative and carry a `// replace with real figures before launch` comment.
- LandingPage renders `<Nav/><main>{sections}</main><Footer/>` in spec §3 order; sections not built yet are simply absent.

- [ ] **Step 1: Hero** per spec §3.1 (copy verbatim). Headline: `SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true, onSplit: self => gsap.from(self.lines, { yPercent: 100, duration: 0.9, ease: EASE_OUT, stagger: 0.08, delay: 0.15 }) })`. Choreography timings from the spec in one `gsap.timeline()` inside `useGSAP`. Tailor: `Art blend parallax={0.9} eager ratio="3/4"`. Stats row: three `Stat`s with a `border-t border-line` above. Primary CTA scrolls to `#rates`.
- [ ] **Step 2: Diorama** — full-bleed band directly below the hero, `h-[70vh] min-h-[420px] lg:h-[90vh]`, `overflow-hidden`, `relative`:
  - street `hero-street.webp`: absolutely positioned, `mix-blend-multiply`, `object-cover object-bottom`, timeline scrubbed over the band's passage: `yPercent: -8 → 8`, `scale: 1.08 → 1`.
  - foliage `hero-foliage.webp`: absolutely positioned at the bottom, `w-[110%] -left-[5%]`, scrubbed `yPercent: 20 → -25` (moves faster than the street).
  - one `gsap.timeline({ scrollTrigger: { trigger: band, start: "top bottom", end: "bottom top", scrub: 0.6 } })` drives both.
  - reduced motion: static, foliage overlapping the street bottom by ~40% of its height.
  - Both images `alt=""` (decorative); the band has `aria-hidden="true"`.
- [ ] **Step 3: Verify** — 1440 and 375 screenshots at scroll 0, 50% and 100% through the band; the layers must visibly separate; no white box edges around the street or tailor (multiply works); Lighthouse-style: no CLS (images have reserved boxes). Fix anything that reads as "template".
- [ ] **Step 4: Commit** (if OK'd).

---

### Task 6: Who borrows

**Files:** Create `src/marketing/WhoBorrows.tsx`; add `BORROWERS` to `content.ts`.

**Interfaces:** `BORROWERS: { name: string; business: string; city: string; amount: number; purpose: string; img: string }[]` (7 entries, one per `tile-*.webp`).

- [ ] **Step 1: content** — realistic, varied names and cities across West Africa, North Africa, South and Southeast Asia, Latin America; amounts between $600 and $9,000; purpose lines lower-case after "for", e.g. `{ name: "Amina Diallo", business: "Tailor", city: "Dakar", amount: 2400, purpose: "a second sewing machine", img: "tile-sewing" }`.
- [ ] **Step 2: Section** per spec §3.2: h2 "Who borrows with Keel" + one line "Owners of small, busy businesses who know exactly what the money is for." Two rows (row A: tiles 1–4, row B: tiles 4–7) each duplicated once so the drift never shows an end; tiles `w-[260px] lg:w-[320px]`, `Art ratio="3/4"` on `bg-mint-50 rounded-[16px]`, caption beneath (name `text-h3`, business · city `text-small text-ink-2`, `{usd(amount)} for {purpose}` `text-small text-accent-700 tabular`). Rows scrub `xPercent` 0 → -12 and -12 → 0 over the section passage. Tiles hover: art `scale(1.03)` 400ms `EASE_OUT` (pointer-fine only: `@media (hover: hover)`). Reduced motion: rows become horizontally scrollable lists (`overflow-x-auto snap-x`).
- [ ] **Step 3: Verify** 1440/375; no horizontal page scroll (the section clips its rows).
- [ ] **Step 4: Commit** (if OK'd).

---

### Task 7: How it works (pinned)

**Files:** Create `src/marketing/HowItWorks.tsx` (steps + the four panel states in the same file; split only if it passes ~250 lines).

**Interfaces:** Consumes `usd`, `quote` (schedule rows are computed from `quote(2400, 6)` and real future month dates from `new Date()`).

- [ ] **Step 1: Static layout** (`id="how"`): left column the 4 steps (copy verbatim from spec §3.3), right column one `bg-surface shadow-float-1 rounded-[16px]` panel. Panel states are real-looking UI:
  1. ID check: fields First name / Last name / ID number / Date of birth with values filling in (`Amina`, `Diallo`, `SN 2048 1173 0042`, `14 Mar 1984`) and a final "Details confirmed" row with a check icon.
  2. Bank: "Connected · read-only" row with bank initial square, "Ecobank · Current account ••4471", "Average monthly inflow $3,180".
  3. Apply: amount `$2,400`, term `6 months`, monthly `usd(quote(2400,6).monthly)`, status "With a loan officer".
  4. Repay: 6 schedule rows (month, `usd(monthly)`, first row "Paid", second "Due {date}").
- [ ] **Step 2: Motion** (≥1024px and not reduced, via `gsap.matchMedia()`): pin the section for `+=300%`, one scrubbed timeline: progress rule `scaleY 0 → 1`, active step colour ink-3 → ink, panel states crossfade (`autoAlpha`, `y: 12 → 0`) at 0/25/50/75%, inner rows of each state stagger in. Below 1024px or reduced: no pin; each step followed by its panel state, all visible.
- [ ] **Step 3: Verify** scrub forwards and backwards at 1440; 375 stacked; keyboard users can read all four states (they're in the DOM, `aria-hidden` only on inactive states while pinned).
- [ ] **Step 4: Commit** (if OK'd).

---

### Task 8: Calculator

**Files:** Create `src/marketing/Calculator.tsx`.

**Interfaces:** Consumes `quote`, `usd`, `MIN_AMOUNT`, `MAX_AMOUNT`, `MIN_TERM`, `MAX_TERM`, `UPFRONT_THRESHOLD`, `Button`.

- [ ] **Step 1:** Section `id="rates"` per spec §3.4: two native range inputs (amount step 100, default 2400; term step 1, default 12) each with a visible `<label>` and an `<output>` showing the current value; custom-styled track (`line`) and filled part (`accent-600`) via a `--fill` CSS variable, 20px thumb in `surface` with `shadow-float-1`, focus ring on the thumb. Results: monthly (`text-h1 tabular text-accent-700`), "Total repaid {usd(total)}", "Fee {usd(fee)}". Upfront line only when `amount > UPFRONT_THRESHOLD` (copy verbatim). Number changes tick: `gsap.to` a proxy object over 250ms `EASE_OUT` writing formatted text (reduced: instant). CTA `Button size="lg" to="/signup"` "Apply for {usd(amount)}". Copy line under it verbatim.
- [ ] **Step 2: Verify** with keyboard arrows on both sliders; $5,000 → no upfront line, $5,100 → line shows $255; values match `quote()`.
- [ ] **Step 3: Commit** (if OK'd).

---

### Task 9: Trust, Testimonial, Final CTA

**Files:** Create `src/marketing/{Trust,Testimonial,FinalCta}.tsx`; add `TESTIMONIAL` to `content.ts`.

- [ ] **Step 1: Trust** per spec §3.5: full-bleed `bg-ink text-canvas py-40`, three statements at `text-h1`, each with its supporting line in `text-body-lg text-canvas/68`, separated by `border-t border-canvas/12`. Each statement's lines rise with SplitText masks on enter (once). Background colour transitions canvas → ink as the section enters (body `background-color` tween scrubbed over the first 20% of the section; reduced: none).
- [ ] **Step 2: Testimonial** per spec §3.6: `TESTIMONIAL = { quote, name, business, city, amount }` — quote in first person, specific and plain (≤ 32 words, mentions what the loan bought and one concrete result, e.g. orders taken). Carpenter `Art blend parallax={0.9} ratio="3/4"`. Quote `text-h2`, attribution `text-small text-ink-2`.
- [ ] **Step 3: FinalCta** per spec §3.7, copy verbatim.
- [ ] **Step 4: Verify** full landing at 1440/375 top to bottom; screenshot each section.
- [ ] **Step 5: Commit** (if OK'd).

---

### Task 10: Whole-site pass and docs

**Files:** Modify `.claude/CLAUDE.md` (Architecture → Frontend paragraph: Keel, Vite 8 + Tailwind 4 + GSAP/Lenis, `/system` reference, `frontend/public/img`, the two ponytail ceilings), `README.md` frontend section if it describes the old pages.

- [ ] **Step 1:** `cd frontend && npm run typecheck && npm test && npm run build`; repo root `npm test` (API) still passes.
- [ ] **Step 2:** Reduced-motion run: force `useReducedMotion` to `true` temporarily, scroll the landing top to bottom — all content visible, no pin, no parallax.
- [ ] **Step 3:** Score against the three skill checklists (refactoring-ui diagnostic, top-design diagnostic, ux-copy principles); fix anything below target; report the scores.
- [ ] **Step 4:** Check build output size (`dist/assets/*.js` gzip) and that hero art is the only eager imagery.
- [ ] **Step 5: Commit** (if OK'd) `docs: describe the Keel frontend`.
