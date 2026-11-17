import { useEffect, useState, type MouseEvent } from "react";

// One switch: the Worker's DEMO_MODE, reported by GET /api/config. Off (or unreachable) = every demo button hidden.
let demoMode: Promise<boolean> | null = null;
export function useDemo() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    demoMode ??= fetch("/api/config")
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: { demoMode?: boolean }) => c.demoMode === true)
      .catch(() => false);
    demoMode.then(setOn);
  }, []);
  return on;
}

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

/** Small "fill with demo data" button. Sits inside a <form>; fills inputs by name, controlled or not. */
export function DemoFill({ values, label = "Fill with demo data", onFill }: { values: () => Record<string, string>; label?: string; onFill?: (v: Record<string, string>) => void }) {

  function fill(e: MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    const v = values();
    for (const [name, value] of Object.entries(v)) {
      const input = form?.elements.namedItem(name);
      if (!(input instanceof HTMLInputElement)) continue;
      setValue.call(input, value); // native setter + input event so React state follows too
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    onFill?.(v);
    form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }

  return <DemoButton label={label} onClick={fill} />;
}

/** The dashed "Demo" button. Hidden unless the API reports demo mode on. */
export function DemoButton({ label, onClick, busy }: { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; busy?: boolean }) {
  if (!useDemo()) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      className="inline-flex items-center gap-2 self-start rounded-control border border-dashed border-line-strong px-3 py-1.5 text-small text-ink-2 transition-colors duration-150 hover:border-ink hover:text-ink disabled:opacity-60"
    >
      <span aria-hidden className="text-label font-medium text-accent-700">Demo</span>
      {busy ? "Working…" : label}
    </button>
  );
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

/** Plausible borrower details; phone and ID are random because the API keeps them unique. */
export const demoProfile = () => {
  const [firstName, lastName] = [pick(["Amina", "Kwame", "Lucía", "Tariq", "Mei", "Joseph"]), pick(["Okafor", "Mensah", "Rojas", "Haddad", "Lin", "Banda"])];
  return {
    firstName,
    lastName,
    phone: `+234 80${digits(1)} ${digits(3)} ${digits(4)}`,
    address: `${1 + Math.floor(Math.random() * 90)} ${pick(["Market Road", "Station Street", "Harbour Lane", "Mill Avenue"])}, ${pick(["Lagos", "Accra", "Nairobi", "Kampala"])}`,
    nationalIdNumber: `DEMO-${digits(9)}`,
  };
};
