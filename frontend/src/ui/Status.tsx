import type { Tone } from "../lib/loans";

const dot: Record<Tone, string> = { accent: "bg-accent-600", warning: "bg-warning", danger: "bg-danger", muted: "bg-ink-3" };
const text: Record<Tone, string> = { accent: "text-accent-700", warning: "text-warning", danger: "text-danger", muted: "text-ink-2" };

/** Dot + word. Never a pill or badge (spec §1). */
export function Status({ tone, children, className = "" }: { tone: Tone; children: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-small font-medium ${text[tone]} ${className}`}>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot[tone]}`} />
      {children}
    </span>
  );
}
