import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usd } from "../lib/format";
import { monthKey, monthLabel, type MonthPoint } from "../lib/history";

const whole = (n: number) => usd(Math.round(n));

/** Round a max up to a friendly axis top (1, 2, 2.5, 5 × 10^n). */
function niceMax(n: number) {
  if (n <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= n) ?? 10) * p;
}

/**
 * Month-by-month repayments: the due amount is the pale column, what was repaid fills it in accent.
 * Hover, focus + arrow keys move the readout; an sr-only table carries the same numbers.
 */
export function MonthlyBars({ data, className = "" }: { data: MonthPoint[]; className?: string }) {
  const id = useId();
  const nowKey = monthKey(new Date());
  const initial = Math.max(0, data.findIndex((d) => d.month === nowKey));
  const [active, setActive] = useState(initial);
  // Draw at the container's real pixel width so axis text stays legible on phones instead of scaling down.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width) || 720); // measure now; the observer only reports later changes reliably
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.length > 0]); // the chart element only exists once there is data
  if (!data.length) return null;

  const top = niceMax(Math.max(...data.map((d) => Math.max(d.due, d.repaid))));
  const narrow = width < 480;
  const W = Math.max(280, width), H = narrow ? 200 : 240, L = narrow ? 44 : 52, B = 28, T = 12;
  const plotW = W - L, plotH = H - B - T;
  const slot = plotW / data.length;
  const bar = Math.min(28, slot * 0.6);
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 44)))); // ~44px per month label
  const cur = data[Math.min(active, data.length - 1)];

  function onKey(e: KeyboardEvent) {
    const next = e.key === "ArrowRight" ? active + 1 : e.key === "ArrowLeft" ? active - 1 : e.key === "Home" ? 0 : e.key === "End" ? data.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(Math.max(0, Math.min(data.length - 1, next)));
  }

  return (
    <figure className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1" aria-live="polite">
        <p className="text-body font-medium">{monthLabel(cur.month)}</p>
        <p className="tabular text-small text-ink-2">
          <span className="text-accent-700">{whole(cur.repaid)} repaid</span> of {whole(cur.due)} due
          {cur.month === nowKey && " · this month"}
        </p>
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label="Monthly repayments chart. Use the left and right arrow keys to read each month."
        aria-describedby={`${id}-table`}
        onKeyDown={onKey}
        className="rounded-control focus-visible:outline-offset-4"
        ref={box}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W} y1={y(top * f)} y2={y(top * f)} stroke="var(--color-line)" />
              <text x={L - 8} y={y(top * f) + 4} textAnchor="end" className="fill-ink-3 text-[12px] tabular">{whole(top * f)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = L + slot * i + slot / 2;
            const on = i === active;
            return (
              <g key={d.month} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} className="cursor-default">
                <rect x={L + slot * i} y={T} width={slot} height={plotH} fill="transparent" />
                {on && <rect x={cx - slot / 2 + 2} y={T} width={slot - 4} height={plotH} rx={4} fill="var(--color-ink)" opacity={0.04} />}
                <rect x={cx - bar / 2} y={y(d.due)} width={bar} height={Math.max(0, T + plotH - y(d.due))} rx={3} fill="var(--color-accent-100)" />
                <rect
                  x={cx - bar / 2}
                  y={y(d.repaid)}
                  width={bar}
                  height={Math.max(0, T + plotH - y(d.repaid))}
                  rx={3}
                  fill={d.repaid + 0.005 < d.due && d.month < nowKey ? "var(--color-warning)" : "var(--color-accent-600)"}
                  className="origin-bottom animate-[bar_700ms_var(--ease-out-expo)_both]"
                  style={{ animationDelay: `${i * 25}ms`, transformBox: "fill-box" }}
                />
                {d.month === nowKey && <circle cx={cx} cy={H - B + 18} r={2.5} fill="var(--color-accent-600)" />}
                {(i % labelEvery === 0 || on) && (
                  <text x={cx} y={H - B + 12} textAnchor="middle" className={`text-[12px] ${on ? "fill-ink" : "fill-ink-3"}`}>
                    {new Date(`${d.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-2">
        <Key className="bg-accent-600">Repaid</Key>
        <Key className="bg-accent-100">Due</Key>
        <Key className="bg-warning">Short in a past month</Key>
      </figcaption>
      <table id={`${id}-table`} className="sr-only">
        <caption>Amount due and repaid per month</caption>
        <thead><tr><th>Month</th><th>Due</th><th>Repaid</th></tr></thead>
        <tbody>
          {data.map((d) => <tr key={d.month}><td>{monthLabel(d.month)}</td><td>{whole(d.due)}</td><td>{whole(d.repaid)}</td></tr>)}
        </tbody>
      </table>
    </figure>
  );
}

export function Key({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2 rounded-[2px] ${className}`} />
      {children}
    </span>
  );
}

/** Thin progress rule with an accessible value. */
export function Bar({ fraction, label, tone = "accent" }: { fraction: number; label: string; tone?: "accent" | "muted" | "danger" }) {
  const fill = tone === "danger" ? "bg-danger" : tone === "muted" ? "bg-ink-3" : "bg-accent-600";
  return (
    <div className="h-[3px] overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
      <div className={`h-full origin-left animate-[grow_1000ms_var(--ease-out-expo)_both] ${fill}`} style={{ transform: `scaleX(${Math.min(1, fraction)})` }} />
    </div>
  );
}
