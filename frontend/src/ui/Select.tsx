import { useId, type SelectHTMLAttributes } from "react";

/** Native select styled like TextField: label above, Keel chevron. */
export function Select({ label, children, className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-label text-ink-2">{label}</label>
      <div className="relative">
        <select
          id={id}
          className="h-11 w-full appearance-none rounded-control border border-line bg-surface pr-10 pl-3 text-body text-ink transition-colors duration-150 hover:border-line-strong"
          {...rest}
        >
          {children}
        </select>
        <svg viewBox="0 0 16 16" aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-2">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
