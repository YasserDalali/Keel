/** Loading placeholder sized like the content it stands in for. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-[4px] bg-ink/6 motion-reduce:animate-none ${className}`} />;
}
