import { Link } from "react-router";
import { usd } from "../lib/format";
import { date, type Event, type Installment, type Step } from "../lib/loans";
import { Ticker } from "../ui/Ticker";

/** One cell per installment: paid, next, due, overdue. The schedule at a glance; the table holds the detail. */
export function PaymentStrip({ installments, nextId, className = "" }: { installments: Installment[]; nextId?: string; className?: string }) {
  if (!installments.length) return null;
  const rows = [...installments].sort((a, b) => a.installment_number - b.installment_number);
  const paid = rows.filter((r) => r.status === "paid").length;
  const overdue = rows.filter((r) => r.status === "overdue").length;
  const next = rows.find((r) => r.id === nextId);
  const summary = `${paid} of ${rows.length} payments made${overdue ? `, ${overdue} overdue` : ""}${next ? `, next due ${date(next.due_date)}` : ""}.`;
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div role="img" aria-label={summary} className="flex h-9 items-end gap-[3px] sm:gap-1">
        {rows.map((r, i) => {
          const isNext = r.id === nextId;
          const cls =
            r.status === "paid" ? "h-full bg-accent-600"
            : r.status === "overdue" ? "h-full bg-danger"
            : isNext ? "h-full bg-accent-200 outline-2 outline-offset-2 outline-accent-600"
            : r.status === "partial" ? "h-2/3 bg-accent-300"
            : "h-1/2 bg-line-strong";
          return (
            <span
              key={r.id}
              title={`Payment ${r.installment_number} · ${date(r.due_date)} · ${usd(r.amount_due)}`}
              className={`min-w-0 flex-1 origin-bottom rounded-[3px] animate-[bar_600ms_var(--ease-out-expo)_both] ${cls}`}
              style={{ animationDelay: `${i * 35}ms` }}
            />
          );
        })}
      </div>
      <div className="tabular flex justify-between text-small text-ink-2">
        <span>{date(rows[0].due_date)}</span>
        <span className="hidden sm:inline">
          <Legend className="bg-accent-600">Paid</Legend>
          <Legend className="bg-accent-200 outline-1 outline-accent-600">Next</Legend>
          <Legend className="bg-line-strong">Due</Legend>
          {overdue > 0 && <Legend className="bg-danger">Overdue</Legend>}
        </span>
        <span>{date(rows.at(-1)!.due_date)}</span>
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="ml-4 inline-flex items-center gap-1.5 first:ml-0">
      <span aria-hidden className={`size-2 rounded-[2px] ${className}`} />
      {children}
    </span>
  );
}

export type StatItem = { label: string; value: number; format?: (n: number) => string; note?: string; strong?: boolean };

/** Row of key figures separated by hairlines. Numbers tick up once on load. */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
      {items.map((s, i) => (
        <div key={s.label} className={`flex flex-col gap-1 py-6 ${i % 2 ? "pl-6 border-l border-line" : "lg:pr-6"} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:pl-6" : ""}`}>
          <dt className="text-small text-ink-2">{s.label}</dt>
          <dd className={`tabular ${s.strong ? "text-h2 text-accent-700" : "text-h2"}`}>
            <Ticker value={s.value} format={s.format ?? usd} />
          </dd>
          {s.note && <dd className="text-small text-ink-3">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Loan life as connected steps. Horizontal from sm up, vertical on phones. */
export function Stepper({ steps }: { steps: Step[] }) {
  const at = Math.max(0, steps.findIndex((s) => s.state === "current"));
  const current = steps.find((s) => s.state === "current") ?? steps.at(-1)!;
  const lastDone = [...steps].reverse().find((s) => s.state === "done" && s.date);
  return (
    <>
    {/* phones: one compact line instead of five stacked steps */}
    <div className="flex flex-col gap-3 sm:hidden">
      <div className="flex gap-1.5" aria-hidden>
        {steps.map((s) => (
          <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.state === "done" ? "bg-accent-600" : s.state === "current" ? "bg-accent-300" : "bg-line-strong"}`} />
        ))}
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-body font-medium">{current.label}</span>
        <span className="tabular text-small text-ink-2">
          Step {steps.indexOf(current) + 1 || at + 1} of {steps.length}
          {lastDone && ` · ${lastDone.label} ${date(lastDone.date!)}`}
        </span>
      </p>
    </div>
    <ol className="hidden gap-4 sm:grid sm:auto-cols-fr sm:grid-flow-col sm:gap-0" aria-label="Loan progress">
      {steps.map((s, i) => (
        <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="relative flex items-start gap-3 sm:flex-col sm:gap-3 sm:pr-4">
          {i > 0 && <span aria-hidden className={`absolute top-[7px] right-full hidden h-px w-full sm:block ${s.state === "todo" ? "bg-line" : "bg-accent-600"}`} style={{ width: "calc(100% - 16px)", right: "calc(100% - 8px)" }} />}
          <span
            aria-hidden
            className={`relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full sm:mt-0 ${
              s.state === "done" ? "bg-accent-600" : s.state === "current" ? "bg-canvas ring-2 ring-accent-600" : "bg-canvas ring-1 ring-line-strong"
            }`}
          >
            {s.state === "done" && <svg viewBox="0 0 16 16" className="size-3 text-canvas"><path d="M4.5 8.5l2 2 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {s.state === "current" && <span className="size-1.5 rounded-full bg-accent-600 motion-safe:animate-pulse" />}
          </span>
          <span className="flex flex-col">
            <span className={`text-body ${s.state === "todo" ? "text-ink-3" : "font-medium"}`}>{s.label}</span>
            <span className="tabular text-small text-ink-2">{s.date ? date(s.date) : s.state === "current" ? "Now" : " "}</span>
          </span>
        </li>
      ))}
    </ol>
    </>
  );
}

const DOT: Record<Event["kind"], string> = {
  applied: "bg-ink-3", approved: "bg-accent-600", paid: "bg-accent-400", paid_off: "bg-accent-700", cancelled: "bg-ink-3", declined: "bg-danger",
};

/** Recent events as a dotted timeline, each linking to its loan. */
export function Activity({ events, limit = 6 }: { events: Event[]; limit?: number }) {
  if (!events.length) return <p className="text-body text-ink-2">Nothing yet. Your applications and payments show up here.</p>;
  return (
    <ol className="relative flex flex-col before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-line">
      {events.slice(0, limit).map((e, i) => (
        <li key={i}>
          <Link to={`/app/loans/${e.loanId}`} className="group relative grid grid-cols-[1.25rem_1fr] gap-x-2 rounded-control py-2.5 transition-colors duration-150">
            <span aria-hidden className={`relative mt-[7px] size-[7px] rounded-full ring-4 ring-canvas ${DOT[e.kind]}`} />
            <span className="flex flex-col">
              <span className="text-body group-hover:text-accent-700">{e.text}</span>
              <span className="tabular text-small text-ink-2">{date(e.date)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Illustration on a mint tile. Tile art with a white backdrop melts in (multiply); `flat` is for pictures that carry their own mint backdrop, and `contain` shows a wide one whole. Decorative. */
export function ArtTile({ src, className = "", position = "50% 60%", flat, contain }: { src: string; className?: string; position?: string; flat?: boolean; contain?: boolean }) {
  return (
    <div aria-hidden className={`relative overflow-hidden rounded-art bg-mint-50 ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 size-full ${contain ? "object-contain" : "object-cover"} ${flat ? "" : "mix-blend-multiply"}`}
        style={{ objectPosition: position }}
      />
    </div>
  );
}
