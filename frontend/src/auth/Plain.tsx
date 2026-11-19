import type { ReactNode } from "react";
import { Link } from "react-router";
import { Wordmark } from "../ui/Wordmark";

/** Bare page for one-off auth steps (callback, email verification). */
export function Plain({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
      <Link to="/" className="self-start rounded-control text-h3"><Wordmark /></Link>
      <main className="flex flex-1 flex-col justify-center py-16">
        <div className="w-full max-w-[440px] animate-[rise_500ms_var(--ease-out-expo)]" aria-live="polite">{children}</div>
      </main>
    </div>
  );
}
