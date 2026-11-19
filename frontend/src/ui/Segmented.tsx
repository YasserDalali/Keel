import type { KeyboardEvent } from "react";

/** Two-to-four option switch (radiogroup) with arrow-key support. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  function onKey(e: KeyboardEvent) {
    const i = options.findIndex((o) => o.value === value);
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className="flex max-w-full overflow-x-auto rounded-control border border-line bg-surface p-1 [scrollbar-width:none] sm:inline-flex">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`h-10 flex-1 shrink-0 whitespace-nowrap rounded-[7px] px-3 text-small font-medium transition-colors duration-150 sm:h-9 sm:flex-none sm:px-4 ${on ? "bg-ink text-canvas" : "text-ink-2 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
