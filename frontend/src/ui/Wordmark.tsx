/** Keel mark (hull + sail) and the name set in General Sans 600. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M17 3c5.5 3 8.5 8 8.5 14H17z" fill="var(--color-mint)" />
      <path d="M15 7c-3.6 2.4-5.8 6-6.4 10H15z" fill="var(--color-accent-600)" />
      <path d="M3 19h26c-1 5.5-6.5 9-13 9S4 24.5 3 19z" fill="var(--color-ink)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="Keel" className={`inline-flex items-center gap-2 ${className}`}>
      <Mark className="size-[1.4em] -translate-y-[0.06em]" />
      <span aria-hidden className="font-semibold tracking-[-0.035em]">Keel</span>
    </span>
  );
}
