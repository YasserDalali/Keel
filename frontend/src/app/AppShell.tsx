import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Skeleton } from "../ui/Skeleton";
import { Wordmark } from "../ui/Wordmark";
import { NotificationBell } from "./Notifications";
import { EmailBanner } from "./EmailBanner";
import { useInstall } from "../lib/pwa";

const isStaff = (role?: string) => role === "officer" || role === "admin";

const LINKS = {
  borrower: [
    { to: "/app/loans", label: "Loans" },
    { to: "/app/schedule", label: "Schedule" },
    { to: "/app/history", label: "History" },
    { to: "/app/statements", label: "Statements" },
  ],
  staff: [{ to: "/app/queue", label: "Review queue" }],
};

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const links = isStaff(user?.role) ? LINKS.staff : LINKS.borrower;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float-1">
        Skip to content
      </a>
      <header className="sticky top-0 z-50 border-b print:hidden border-line bg-canvas/90 backdrop-blur-md">
        <Container className="flex h-16 items-center gap-10">
          <Link to="/app" className="rounded-control text-h3" aria-label="Keel, your account">
            <Wordmark />
          </Link>
          <nav aria-label="App" className="hidden h-full items-stretch gap-8 sm:flex">
            {links.map((l) => <Tab key={l.to} {...l} />)}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <NotificationBell />
            <AccountMenu email={user?.email ?? ""} staff={isStaff(user?.role)} onSignOut={() => signOut().then(() => navigate("/"))} />
          </div>
        </Container>
        <Container as="nav" aria-label="App" className="flex h-11 items-stretch justify-between gap-4 border-t border-line sm:hidden">
          {links.map((l) => <Tab key={l.to} {...l} />)}
        </Container>
      </header>

      <EmailBanner />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center text-body transition-colors duration-150 after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:origin-left after:bg-ink after:transition-transform after:duration-400 after:ease-out-expo ${
          isActive ? "text-ink after:scale-x-100" : "text-ink-2 after:scale-x-0 hover:text-ink"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function PageSkeleton() {
  return (
    <Container className="flex flex-col gap-6 py-12 lg:py-16" aria-busy>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-14 w-full max-w-[520px]" />
      <Skeleton className="mt-6 h-40 w-full" />
    </Container>
  );
}

/** /app lands each role on its home. */
export function AppIndex() {
  const { user } = useAuth();
  return <Navigate to={isStaff(user?.role) ? "/app/queue" : "/app/loans"} replace />;
}

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return isStaff(user?.role) ? children : <Navigate to="/app" replace />;
}

/** Page heading block shared by every app page: eyebrow, title, optional intro and actions. */
export function PageHead({ eyebrow, title, intro, actions }: { eyebrow?: React.ReactNode; title: string; intro?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-3">
        {eyebrow && <p className="text-label text-ink-2">{eyebrow}</p>}
        <h1 className="text-h1 max-w-[20ch]">{title}</h1>
        {intro && <p className="max-w-[56ch] text-body-lg text-ink-2">{intro}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="inline size-4" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LoadError({ message }: { message?: string }) {
  return (
    <Container className="flex flex-col items-start gap-6 py-16">
      <h1 className="text-h2 max-w-[24ch]">This page didn't load</h1>
      <p role="alert" className="max-w-[56ch] text-body text-ink-2">{message ?? "Something went wrong."}</p>
      <Button variant="secondary" onClick={() => location.reload()}>Try again</Button>
    </Container>
  );
}

/** Person icon that opens a small panel: who's signed in, Profile, and Sign out in red. */
function AccountMenu({ email, staff, onSignOut }: { email: string; staff: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const install = useInstall();

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex h-11 w-full items-center gap-3 rounded-control px-3 text-left text-body transition-colors duration-150";
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-label="Your account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-11 items-center justify-center rounded-full border transition-colors duration-150 ${open ? "border-ink bg-surface text-ink" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink"}`}
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5 19.5c1.3-3.3 4-5 7-5s5.7 1.7 7 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label="Your account"
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-[min(280px,calc(100vw-32px))] rounded-art bg-surface p-2 shadow-float-2 animate-[rise_250ms_var(--ease-out-expo)]"
        >
          <div className="border-b border-line px-3 pt-2 pb-3">
            <p className="text-label text-ink-2">{staff ? "Signed in as officer" : "Signed in as"}</p>
            <p className="truncate text-body" title={email}>{email}</p>
          </div>
          <div className="flex flex-col pt-2">
            {!staff && (
              <Link role="menuitem" to="/app/profile" onClick={() => setOpen(false)} className={`${item} hover:bg-canvas focus-visible:bg-canvas`}>
                <svg viewBox="0 0 24 24" className="size-5 text-ink-2" aria-hidden>
                  <circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M5 19.5c1.3-3.3 4-5 7-5s5.7 1.7 7 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Profile
              </Link>
            )}
            {install && (
              <button role="menuitem" type="button" onClick={() => { setOpen(false); install(); }} className={`${item} hover:bg-canvas focus-visible:bg-canvas`}>
                <svg viewBox="0 0 24 24" className="size-5 text-ink-2" aria-hidden>
                  <path d="M12 4v10M8 10l4 4 4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Install app
              </button>
            )}
            <button role="menuitem" type="button" onClick={onSignOut} className={`${item} text-danger hover:bg-danger/8 focus-visible:bg-danger/8`}>
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
