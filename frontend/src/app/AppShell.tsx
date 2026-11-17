import { Suspense } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Skeleton } from "../ui/Skeleton";
import { Wordmark } from "../ui/Wordmark";

const isStaff = (role?: string) => role === "officer" || role === "admin";

const LINKS = {
  borrower: [
    { to: "/app/loans", label: "Loans" },
    { to: "/app/setup", label: "Your details" },
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
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-md">
        <Container className="flex h-16 items-center gap-10">
          <Link to="/app" className="rounded-control text-h3" aria-label="Keel, your account">
            <Wordmark />
          </Link>
          <nav aria-label="App" className="hidden h-full items-stretch gap-8 sm:flex">
            {links.map((l) => <Tab key={l.to} {...l} />)}
          </nav>
          <div className="ml-auto flex items-center gap-6">
            <span className="hidden max-w-[24ch] truncate text-small text-ink-2 md:block" title={user?.email}>
              {isStaff(user?.role) && <span className="text-ink">Officer · </span>}
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => signOut().then(() => navigate("/"))}
              className="rounded-control text-body text-ink-2 transition-colors duration-150 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </Container>
        <Container as="nav" aria-label="App" className="flex h-11 items-stretch gap-6 border-t border-line sm:hidden">
          {links.map((l) => <Tab key={l.to} {...l} />)}
        </Container>
      </header>

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
