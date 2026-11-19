import { Link, useSearchParams } from "react-router";
import { http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import {
  download, groupByMonth, monthGrid, monthKey, monthLabel, nextUnpaid, shiftMonth, toIcs, toneOf, ymd,
  type CellTone, type ScheduleItem,
} from "../lib/history";
import { date, shortId, type Tone } from "../lib/loans";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Status } from "../ui/Status";
import { LoadError, PageHead, PageSkeleton } from "./AppShell";
import { Key } from "./charts";
import { Segmented } from "../ui/Segmented";
import { Select } from "../ui/Select";
import { ReminderSettings } from "./Reminders";
import { ArtTile } from "./visuals";

type View = "calendar" | "list";

const CELL: Record<CellTone, string> = {
  paid: "bg-accent-600 text-canvas",
  partial: "bg-accent-200 text-ink",
  next: "bg-accent-100 text-accent-800 outline-2 outline-accent-600 -outline-offset-2",
  due: "bg-ink/6 text-ink",
  overdue: "bg-danger text-canvas",
};
const TONE_WORD: Record<CellTone, string> = { paid: "paid", partial: "part paid", next: "next payment", due: "due", overdue: "overdue" };
const STATUS: Record<CellTone, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "accent" },
  partial: { label: "Part paid", tone: "warning" },
  next: { label: "Next", tone: "accent" },
  due: { label: "Due", tone: "muted" },
  overdue: { label: "Overdue", tone: "danger" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const left = (i: ScheduleItem) => Math.round((i.amountDue - i.amountPaid) * 100) / 100;

export default function Schedule() {
  const { data, error, loading } = useLoad(() => http<{ installments: ScheduleItem[] }>("/schedule"));
  const [params, setParams] = useSearchParams();

  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  const all = data.installments;
  const loanIds = [...new Set(all.map((i) => i.loanId))];
  const loanFilter = loanIds.includes(params.get("loan") ?? "") ? params.get("loan")! : "";
  const items = loanFilter ? all.filter((i) => i.loanId === loanFilter) : all;
  const view: View = params.get("view") === "list" ? "list" : "calendar";
  const next = nextUnpaid(items);
  const month = /^\d{4}-\d{2}$/.test(params.get("m") ?? "") ? params.get("m")! : next ? next.dueDate.slice(0, 7) : monthKey(new Date());
  const unpaid = items.filter((i) => i.status !== "paid");
  const owed = unpaid.reduce((s, i) => s + left(i), 0);

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  if (!all.length) {
    return (
      <Container className="flex flex-col gap-12 py-12 lg:py-16" data-stagger>
        <PageHead eyebrow="Schedule" title="Repayment schedule" />
        <div className="grid items-center gap-8 border-t border-line pt-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-12">
          <div className="flex flex-col items-start gap-4">
            <p className="text-body-lg">No payments scheduled.</p>
            <p className="max-w-[46ch] text-body text-ink-2">Your schedule appears here as soon as a loan officer approves a loan, with every due date on a calendar.</p>
            <Button to="/app/loans" variant="secondary">Back to loans</Button>
          </div>
          <ArtTile flat contain src="/img/app-schedule.webp" className="h-[280px] w-full sm:h-[360px]" />
        </div>
      </Container>
    );
  }

  return (
    <Container className="flex flex-col gap-12 py-12 lg:gap-16 lg:py-16" data-stagger>
      <PageHead
        eyebrow="Schedule"
        title="Repayment schedule"
        intro={
          next
            ? <>{unpaid.length} {unpaid.length === 1 ? "payment" : "payments"} left, <span className="tabular">{usd(Math.round(owed * 100) / 100)}</span> in total. Next: <span className="tabular text-ink">{usd(left(next))}</span> on {date(next.dueDate)}.</>
            : "Every payment is made."
        }
        actions={
          <Button variant="secondary" disabled={!unpaid.length} onClick={() => download("keel-payments.ics", toIcs(items), "text/calendar")}>
            <CalendarIcon /> Add to calendar
          </Button>
        }
      />

      <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <section aria-label={view === "calendar" ? "Calendar" : "List"} className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Segmented<View>
              label="View"
              value={view}
              options={[{ value: "calendar", label: "Calendar" }, { value: "list", label: "List" }]}
              onChange={(v) => set({ view: v === "list" ? "list" : null })}
            />
            {loanIds.length > 1 && (
              <Select label="Loan" value={loanFilter} onChange={(e) => set({ loan: e.target.value || null, m: null })} className="w-full sm:w-64">
                <option value="">All loans</option>
                {loanIds.map((id) => {
                  const amt = all.find((i) => i.loanId === id)!.loanAmount;
                  return <option key={id} value={id}>{shortId(id)} · {usd(amt)}</option>;
                })}
              </Select>
            )}
          </div>

          {view === "calendar" ? (
            <>
              <Calendar month={month} items={items} nextId={next?.id} onMonth={(m) => set({ m })} />
              <div className="sm:hidden">
                {items.some((i) => i.dueDate.startsWith(month)) ? (
                  <List items={items.filter((i) => i.dueDate.startsWith(month))} nextId={next?.id} />
                ) : (
                  <p className="text-body text-ink-2">Nothing due in {monthLabel(month)}.</p>
                )}
              </div>
            </>
          ) : (
            <List items={items} nextId={next?.id} />
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-2">
            <Key className="bg-accent-600">Paid</Key>
            <Key className="bg-accent-100 outline-1 outline-accent-600">Next</Key>
            <Key className="bg-ink/10">Due</Key>
            <Key className="bg-accent-200">Part paid</Key>
            <Key className="bg-danger">Overdue</Key>
          </div>
        </section>

        <aside className="flex flex-col gap-12 lg:col-span-4">
          <MonthSummary month={month} items={items} />
          <ReminderSettings />
        </aside>
      </div>
    </Container>
  );
}

function Calendar({ month, items, nextId, onMonth }: { month: string; items: ScheduleItem[]; nextId?: string; onMonth: (m: string) => void }) {
  const byDay = new Map<string, ScheduleItem[]>();
  for (const i of items) byDay.set(i.dueDate, [...(byDay.get(i.dueDate) ?? []), i]);
  const today = ymd(new Date());
  const first = items[0]?.dueDate.slice(0, 7);
  const last = items.at(-1)?.dueDate.slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-h3" aria-live="polite">{monthLabel(month)}</h2>
        <div className="flex items-center gap-1">
          <IconButton label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))} disabled={!!first && month <= first}>
            <path d="M10 4L6 8l4 4" />
          </IconButton>
          <button type="button" onClick={() => onMonth(monthKey(new Date()))} className="h-11 rounded-control px-3 text-small font-medium text-ink-2 hover:text-ink">
            Today
          </button>
          <IconButton label="Next month" onClick={() => onMonth(shiftMonth(month, 1))} disabled={!!last && month >= last}>
            <path d="M6 4l4 4-4 4" />
          </IconButton>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Payments due in {monthLabel(month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="pb-2 text-left text-label font-medium text-ink-2 sm:pl-2">
                <abbr title={d} className="no-underline">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week, w) => (
            <tr key={w}>
              {week.map((c) => {
                const due = byDay.get(c.date) ?? [];
                const isToday = c.date === today;
                return (
                  <td key={c.date} className={`h-14 border border-line align-top sm:h-24 ${c.inMonth ? "bg-surface" : "bg-transparent"}`}>
                    <div className="flex h-full flex-col gap-1 p-1 sm:p-2">
                      <span
                        className={`tabular flex size-6 items-center justify-center rounded-full text-small ${
                          isToday ? "bg-ink text-canvas" : c.inMonth ? "text-ink" : "text-ink-3"
                        }`}
                      >
                        <span className="sr-only">{date(c.date)}{isToday ? ", today" : ""}</span>
                        <span aria-hidden>{Number(c.date.slice(8))}</span>
                      </span>
                      {due.map((i) => {
                        const t = toneOf(i, nextId);
                        return (
                          <Link
                            key={i.id}
                            to={`/app/loans/${i.loanId}`}
                            title={`Payment ${i.number} of ${i.count} · ${usd(left(i) || i.amountDue)} · ${TONE_WORD[t]}`}
                            className={`tabular block h-2 truncate rounded-full font-medium transition-transform duration-150 hover:-translate-y-px sm:h-auto sm:rounded-[4px] sm:px-1.5 sm:py-0.5 sm:text-small sm:leading-tight ${CELL[t]}`}
                          >
                            <span className="sr-only">Payment {i.number} of {i.count}, loan {shortId(i.loanId)}, {TONE_WORD[t]}: </span>
                            {/* phones: the cell shows a colour marker; the month's payments are listed under the calendar */}
                            <span className="hidden sm:inline">{usd(t === "paid" ? i.amountDue : left(i))}</span>
                            <span className="sr-only sm:hidden">{usd(t === "paid" ? i.amountDue : left(i))}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function List({ items, nextId }: { items: ScheduleItem[]; nextId?: string }) {
  return (
    <div className="flex flex-col gap-10">
      {groupByMonth(items).map((g) => (
        <section key={g.month} aria-labelledby={`m-${g.month}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id={`m-${g.month}`} className="text-h3">{monthLabel(g.month)}</h2>
            <p className="tabular text-small text-ink-2">
              {usd(g.due)} due{g.paid > 0 && ` · ${usd(g.paid)} paid`}{g.left > 0 && g.paid > 0 && ` · ${usd(g.left)} left`}
            </p>
          </div>
          <ul>
            {g.items.map((i) => {
              const t = toneOf(i, nextId);
              return (
                <li key={i.id} className={`border-t border-line last:border-b ${t === "next" ? "bg-surface" : ""}`}>
                  <Link to={`/app/loans/${i.loanId}`} className="group grid grid-cols-[3rem_1fr_auto] items-center gap-4 py-3 sm:grid-cols-[4rem_1fr_auto_7rem] sm:px-2">
                    <span className="tabular text-body">{new Date(`${i.dueDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body">Payment {i.number} of {i.count}</span>
                      <span className="truncate text-small text-ink-2">Loan {shortId(i.loanId)} · {usd(i.loanAmount)}</span>
                    </span>
                    <span className="tabular text-right text-body">
                      {usd(i.amountDue)}
                      {i.status === "partial" && <span className="block text-small text-ink-2">{usd(i.amountPaid)} paid</span>}
                    </span>
                    <span className="col-span-3 sm:col-span-1 sm:text-right"><Status tone={STATUS[t].tone}>{STATUS[t].label}</Status></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MonthSummary({ month, items }: { month: string; items: ScheduleItem[] }) {
  const g = groupByMonth(items).find((m) => m.month === month);
  return (
    <section aria-labelledby="month-sum" className="flex flex-col gap-4">
      <h2 id="month-sum" className="text-h3">{monthLabel(month)}</h2>
      {g ? (
        <dl className="grid grid-cols-3 gap-4 border-y border-line py-4">
          <Fig label="Due" value={usd(g.due)} />
          <Fig label="Paid" value={usd(g.paid)} />
          <Fig label="Left" value={usd(g.left)} strong={g.left > 0} />
        </dl>
      ) : (
        <p className="text-body text-ink-2">Nothing due this month.</p>
      )}
    </section>
  );
}

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className={`tabular text-h3 ${strong ? "text-accent-700" : ""}`}>{value}</dd>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40">
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );
}
