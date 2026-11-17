# Keel — design system, landing page and sign-in (phase 1)

Approved direction: **A. Marketplace clarity** (Upwork-like). Market: small businesses in emerging markets, amounts in USD.

## Scope

**In:** delete `frontend/` (including the untracked `frontend/vite-app`) and `docs/`. Rebuild `frontend/` from zero with:
the design tokens, 7 UI primitives, a `/system` page that shows every token and primitive, the public landing page, the sign-in page and the create-account page.

**Out (phase 2, same system):** onboarding, KYC, borrower dashboard, officer queue, upfront-payment modal.
Until then, a successful sign-in lands on `/app`, a bare authenticated route showing the account email and a sign-out button.

**Untouched:** `api/`, `README.md`, `CLOUDFLARE_MICROLOAN_PLAN.md`, `wrangler.toml`.
The root `package.json` `frontend:*` scripts keep working because the new app keeps the same script names.

## Product facts the UI must respect (read from `api/`)

- Flat rate `LOAN_FLAT_INTEREST_RATE` = 5% of principal, total. Repaid in **monthly** installments: `amount × 1.05 / termMonths`, last installment absorbs rounding.
- Loans above `LOAN_UPFRONT_THRESHOLD` ($5,000) require an upfront payment of 5% before disbursement.
- Before applying, a borrower must pass ID verification (KYC) and connect a bank (Plaid). A loan officer approves each loan.
- Register/login take `{ email, password, turnstileToken }`. Login returns a JWT; `GET /api/auth/me` returns `{ userId, email, role }`.
- The frontend mirrors the 5% rate and $5,000 threshold as constants in `src/lib/loan-terms.ts`.
  Ceiling: they drift if the env vars change. Upgrade path: expose them from `GET /api/config`.

## 1. Tokens (`src/styles/tokens.css`, Tailwind v4 `@theme`)

### Color
| Token | Value | Use |
|---|---|---|
| `canvas` | `#F7F6F2` | page background |
| `surface` | `#FDFCFA` | raised surfaces (inputs, menus) |
| `ink` | `#14271F` | primary text, dark section background |
| `ink-2` | ink @ 68% | secondary text |
| `ink-3` | ink @ 48% | tertiary text, placeholders are not used |
| `line` | ink @ 10% | borders, dividers |
| `accent-50…900` | scale around `accent-600 = #1F7A4D` | primary buttons, links, key figures only |
| `danger` | `#B42318` | errors |
| `warning` | `#B54708` | warnings |
| `mint` | `#7FD1AE` | illustration only |
| `mint-50` | `#D8EFE2` | illustration tiles (sampled from the delivered art) |
| `mustard` | `#C9A43A` | illustration only |
| `lilac` | `#B59BD9` | illustration only, rare |

No pure `#000`/`#fff`. Branded `::selection` = accent-100 on ink. Focus ring = 2px accent-600, 2px offset, on every interactive element.

### Type
One family: **General Sans** (Fontshare, ITF Free Font License), loaded from the Fontshare CSS endpoint with `display=swap` (self-host later if the third-party request matters).

| Step | Size | Leading | Tracking | Weight |
|---|---|---|---|---|
| display | `clamp(3rem, 7vw, 6.5rem)` | 0.95 | -0.035em | 600 |
| h1 | `clamp(2.25rem, 4.5vw, 3.75rem)` | 1.0 | -0.03em | 600 |
| h2 | `clamp(1.75rem, 3vw, 2.5rem)` | 1.1 | -0.02em | 600 |
| h3 | 1.375rem | 1.25 | -0.01em | 500 |
| body-lg | 1.1875rem | 1.55 | -0.01em | 400 |
| body | 1.0625rem (17px) | 1.55 | -0.005em | 400 |
| small | 0.875rem | 1.5 | 0 | 400 |
| label | 0.8125rem | 1.4 | 0.01em | 500, sentence case |

Money and stats: `font-variant-numeric: tabular-nums`. Headlines: `text-wrap: balance`. Body measure max 65ch.

### Space, shape, depth
- Spacing scale: 4 8 12 16 24 32 48 64 96 128 160 px. Section padding varies by section (see §3), never one value for all.
- Radius: 10px controls, 16px illustration tiles, 0 on full-bleed media. **No pill shapes anywhere.**
- Shadows, two-layer, only on floating things:
  - `float-1`: `0 1px 2px rgb(20 39 31 / .06), 0 4px 12px rgb(20 39 31 / .06)`
  - `float-2`: `0 2px 4px rgb(20 39 31 / .06), 0 16px 40px rgb(20 39 31 / .12)`
- No coloured side-borders on blocks, no decorative cards, no gradient blobs.

### Motion
- `--ease-out: cubic-bezier(.16,1,.3,1)` (default), `--ease-in-out: cubic-bezier(.76,0,.24,1)` (state changes).
- Durations: 150 / 250 / 400 / 700 ms.
- Only `transform`, `opacity`, `clip-path` are animated.
- `prefers-reduced-motion: reduce`: Lenis off, parallax off, SplitText off (text shown whole), pinned section becomes a plain stacked list, fades capped at 150ms.

## 2. Primitives (`src/ui/`)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant: primary \| secondary \| ghost`, `size: md \| lg`, `loading`, `as` link | primary = accent-600 fill; secondary = ink 1px line; ghost = text + underline draw. Loading keeps width, swaps label for a 3-dot pulse, sets `aria-busy`. |
| `TextField` | `label`, `hint`, `error`, native input props | label above, hint below in ink-3; error replaces hint in danger with `aria-describedby`. No placeholder text. |
| `TextLink` | native anchor/router link | underline scales in from left on hover/focus, 250ms. |
| `Container` / `Grid` | — | max 1320px, 24px gutter mobile, 12-col grid ≥ 1024px. |
| `Art` | `src`, `alt`, `ratio`, `parallax?: number`, `reveal?` | illustration image: fixed `aspect-ratio` (zero CLS), WebP only, lazy below the fold. `blend` prop applies `mix-blend-mode: multiply` so white/cream art backgrounds vanish into the canvas. `parallax` = y-speed factor via ScrollTrigger scrub; `reveal` = clip-path inset wipe on enter. |
| `Stat` | `value`, `label`, `format` | counts up once on enter (tabular figures). |
| `Nav` | — | Keel wordmark, How it works, Rates, Sign in, **Apply** button. Hides on scroll down, returns on scroll up; gains `canvas` background + `line` border after 24px. Mobile: full-screen sheet menu. |

Motion helpers live in `src/lib/motion.ts`: Lenis bootstrap wired to `gsap.ticker`, a `useReducedMotion` hook, and the shared eases. Nothing else.

## 3. Landing page (`/`, `src/marketing/`)

Rhythm deliberately varies: tight hero → full-bleed strip → pinned tall section → contained calculator → dark full-bleed → airy testimonial → compact CTA.

1. **Hero: type between layers** (the signature parallax moment; replaces the earlier split hero + separate diorama band).
   - Statement headline across the full width, three manual lines with line 2 indented two columns: **"Capital for the / business you / already run."** at `clamp(2.75rem, 10vw, 10.5rem)`, leading 0.9, tracking −0.045em. Each line rises from its own mask on load (stagger 90ms).
   - Under it, the deck: sub copy (body-lg, ink-2) on the left, **Check what you can borrow** (primary, scrolls to `#rates`) + How it works (ghost) on the right.
   - Directly below, in flow so it never collides with the text at any viewport: the street scene full-bleed (`mix-blend-multiply`, top 30% faded with a mask, `46svh` mobile / `80svh` desktop).
   - The cut-out foliage (`hero-foliage`, HD alpha) sits absolutely at the section bottom, in front of everything.
   - `hero-corners` (alpha) hangs from the very top behind the type, split into left/right halves each rendered at 80vw and anchored to its outer edge so the clusters frame the type without touching it; they settle in on load and on scroll part sideways (`xPercent ∓24`), rise (`yPercent −45`) and turn (`±5°`).
   - Street is the transparent cut-out `hero-street` at natural aspect (150% wide on mobile), no blend or mask.
   - Nav is hidden over the hero top and slides in (700ms expo) once the page has scrolled 80px, sliding back out above that; it also shows whenever it takes keyboard focus. Frosted (`bg-canvas/80` + blur).
   - Scroll, one scrubbed timeline over the section: street `yPercent 0→14` (back, lags most), type block `yPercent 0→35` (middle), foliage `yPercent 0→−35` (front, sweeps up over the street and type). Intro tweens use `y` (px) so they never fight the scroll `yPercent`.
   - Reduced motion: everything static, same composition.
   - Stats strip (3 × `Stat`) follows the section on the canvas with a bottom rule.
2. **Who borrows** (full-bleed, `py-96`). Header: h2 at `clamp(3rem, 6.5vw, 6rem)` + line top-left; the tailor illustration, **static** (multiply-blended), on the right at up to 600px wide and its native 1200:1608 proportions (never cropped); bottom-left Amina's story: quote (h2), name line, Borrowed / Monthly / Repaid figures and a 12-segment repayment bar (9 paid, 1 next dashed, 2 to come) that fills on enter. Below, two rows built from the other 6 tiles (motorbike, grocer, pottery, bakery, produce, cart) as `mint-50` tiles, each with a spot illustration of what the loan paid for, drifting horizontally in opposite directions, scrubbed by scroll (±12vw). Caption under each, profile-style:
   - Tiles and the How it works panel use `useTilt`: always live, no hover needed. Every on-screen card leans toward the cursor wherever it is (strongest on the card, easing off with distance, up to ±12°), and scrolling adds a lean from scroll speed and the card's viewport position (touch gets the scroll lean). Hover adds the art zoom and glare. Reduced motion: no tilt.
   name (h3) · business and city (small, ink-2) · "$2,400 for a second sewing machine" (small, accent-700, tabular).
3. **How it works** (pinned on ≥1024px, ~300vh of scroll). Left: 4 steps, active one ink, others ink-3, a 2px progress rule fills alongside.
   1. Verify your ID — "Photograph your ID. We read the details for you, you confirm them."
   2. Connect your bank — "Read-only access to see your cash flow. We never move money from it."
   3. Apply — "Choose an amount and a term. A loan officer reviews it, usually within two business days."
   4. Repay monthly — "Fixed monthly payments. Pay early any time at no cost."
   Right: one realistic product panel (`surface`, `float-1`) that changes per step: ID fields fill in → bank connected row with balance → loan form values tick to final → repayment schedule rows draw in with dates and amounts. Crossfades 400ms `ease-in-out`.
   Mobile: no pin; each step stacks with its panel state beneath it.
   - Entrance (once, at 80% viewport): heading rises, steps slide in 50ms apart, the panel swings up from `rotationX 14`, all under 1s.
   - The panel stack tilts in 3D (`useTilt`, up to ±9°), on its own wrapper so it never fights the pinned crossfades. Crossfades and row staggers are short (0.3 / 0.03 of the scrub).
4. **Calculator** (`py-128`, contained 8 cols, `id="rates"`). Native `<input type="range">` styled: amount $500–$10,000 step $100, term 3–24 months.
   Output: monthly payment (h1, tabular, accent-700), total repaid, fee in dollars. If amount > $5,000: one line "Loans over $5,000 need 5% paid upfront ($X) before we send the money." CTA: **Apply for $X** → `/signup`.
   Copy under it: "One flat 5% fee, shown in dollars before you sign. No interest that grows, no penalties for paying early."
5. **Trust** (full-bleed `ink` background, canvas text, `py-160`). Three statements in large type, each with one supporting line:
   - "Your ID is read once and encrypted." — "Personal details are stored encrypted (AES-GCM). Our staff see them only when reviewing your loan."
   - "We read your bank, we never touch it." — "Bank access is read-only and you can disconnect it any time."
   - "A person decides." — "Every loan is reviewed by a loan officer, not only a score."
6. **Testimonial** (`py-128`). One large quote (h2, ink) beside the carpenter illustration (`blend`, `parallax 0.9`). Attribution: name, workshop, city, loan amount.
7. **Final CTA** (`py-96`): h1 "Ready when your next order is." + **Create your account** + "Takes about ten minutes. You'll need an ID and online banking."
8. **Footer**: wordmark, 3 short link columns, "Keel is a demonstration lending platform." legal line, © year.

## 4. Auth (`/signin`, `/signup`, `src/auth/`)

- Split screen ≥1024px: form column left (max 400px, vertically centred), shop-front illustration right (`object-fit: cover`, `parallax 0.9`, full height, 0 radius). Mobile: illustration hidden, wordmark on top.
- **Sign in** — h1 "Welcome back" · Email · Password · **Sign in** · "New to Keel? Create an account".
- **Create account** — h1 "Create your Keel account" · Email · Password (hint: "At least 8 characters") · **Create account** · "Already have an account? Sign in". On success it signs in and goes to `/app`.
- Errors (what happened + how to fix), inline under the field or above the button:
  - 401: "That email and password don't match. Check both and try again."
  - 409 on signup: "There's already an account with this email. Sign in instead." (link)
  - Network: "We couldn't reach Keel. Check your connection and try again."
- Turnstile token stays the always-pass test value, as the old frontend did. Real widget is a phase-2 task.
- Form entrance: fields stagger up 60ms apart, 400ms `ease-out`.

## 5. Build

- `frontend/`: Vite 6, React 19, TypeScript, Tailwind v4 (`@tailwindcss/vite`, CSS-first `@theme`), `gsap` + `@gsap/react` (ScrollTrigger, SplitText), `lenis`, `react-router` 7, `openapi-fetch` + `openapi-typescript` (`npm run gen:types` from `../api/openapi.json`).
- Layout: `src/styles/`, `src/ui/`, `src/marketing/`, `src/auth/`, `src/lib/` (`api.ts`, `auth.tsx` context, `motion.ts`, `loan-terms.ts`), `public/img/`, `public/fonts/`.
- Vite dev proxy `/api` → `http://localhost:8787` (wrangler dev).
- Wordmark: hand-set SVG "Keel" in General Sans 600, tightened tracking, with the descender-less form; favicon derived from the "K".

## 6. Verification

- `npm run typecheck` and `npm run build` in `frontend/` pass.
- `npm test` at root still passes (API untouched).
- Browser pane at 375×812 and 1440×900: screenshots of every landing section and both auth pages; no horizontal scroll; Lighthouse-style check of CLS ≈ 0.
- Reduced-motion emulation: page fully readable, no pinned section, no parallax.
- Sign up → sign in → `/app` against `wrangler dev` with the local D1.
- One small `loan-terms` check (monthly payment + upfront rule) runs in vitest alongside the frontend.

## 7. Images to generate (Gemini)

Textured flat illustrations, not photos. Prompts: `tasks/gemini-prompts.md`. Delivered and processed into `frontend/public/img/*.webp` (12 files): `hero-street`, `hero-tailor`, `hero-foliage` (alpha cut-out), `testimonial-carpenter`, `auth-shop`, 7 × `tile-*`. Not delivered and not needed: `tile-phone`, `pattern-botanical`.
