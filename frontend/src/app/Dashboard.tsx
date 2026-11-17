import { Link } from "react-router";
import { http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import { quote } from "../lib/loan-terms";
import {
  activity, date, loanStatus, nextDue, readiness, shortId, totals, upcoming,
  type Installment, type Loan, type LoanWithSchedule, type Profile,
} from "../lib/loans";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Status } from "../ui/Status";
import { Arrow, LoadError, PageSkeleton } from "./AppShell";
import { Activity, ArtTile, PaymentStrip, StatStrip } from "./visuals";

async function load() {
  const [{ loans }, profile] = await Promise.all([http<{ loans: Loan[] }>("/loans"), http<Profile>("/profile")]);
  // Schedules exist only once a loan is approved; fetch those so totals, upcoming and activity are real.
  const withSchedules: LoanWithSchedule[] = await Promise.all(
    loans.map(async (loan) =>
      loan.approved_at ? { loan, installments: (await http<{ installments: Installment[] }>(`/loans/${loan.id}`)).installments } : { loan, installments: [] },
    ),
  );
  return { loans, profile, withSchedules };
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const count = (n: number) => String(Math.round(n));

export default function Dashboard() {
  const { data, error, loading } = useLoad(load);
  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  const { loans, profile, withSchedules } = data;
  const steps = readiness(profile);
  const ready = steps.every((s) => s.done);
  const soonest = upcoming(withSchedules, 1)[0]; // with several loans, feature the payment due first
  const active = soonest && withSchedules.find((l) => l.loan.id === soonest.loan.id);
  const next = active ? nextDue(active.installments) : null;
  const t = totals(withSchedules);
  const waiting = loans.filter((l) => l.status === "pending" || l.status === "under_review").length;
  const funded = withSchedules.some((l) => l.installments.length);
  const name = profile.profile?.firstName;

  const summary = t.owed > 0
    ? `You owe ${usd(t.owed)} with ${t.paymentsLeft} ${t.paymentsLeft === 1 ? "payment" : "payments"} to go.${waiting ? ` ${waiting} ${waiting === 1 ? "application is" : "applications are"} with a loan officer.` : ""}`
    : waiting ? `${waiting} ${waiting === 1 ? "application is" : "applications are"} with a loan officer. Decisions usually take two business days.`
    : ready ? "You're set up. Choose an amount whenever you're ready."
    : "Three short steps and you can apply. Stop any time and pick up where you left off.";

  return (
    <Container className="flex flex-col gap-16 py-12 lg:gap-24 lg:py-16" data-stagger>
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className="text-label text-ink-2">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="text-h1 max-w-[18ch]">{greeting()}{name ? `, ${name}` : ""}.</h1>
          <p className="max-w-[54ch] text-body-lg text-ink-2">{summary}</p>
        </div>
        <ApplyButton ready={ready} />
      </header>

      {active && next && <NextPayment loan={active.loan} next={next} schedule={active.installments} />}

      {funded && (
        <StatStrip
          items={[
            { label: "Borrowed to date", value: t.borrowed },
            { label: "Still owed", value: t.owed, strong: t.owed > 0 },
            { label: "Repaid", value: t.repaid },
            { label: "Payments left", value: t.paymentsLeft, format: count },
          ]}
        />
      )}

      {!ready && <Checklist steps={steps} />}

      <div className="grid gap-16 lg:grid-cols-12 lg:gap-10">
        <section aria-labelledby="all-loans" className="flex flex-col gap-6 lg:col-span-8">
          <h2 id="all-loans" className="text-h2">All loans</h2>
          {loans.length ? <LoanTable loans={loans} /> : <EmptyLoans ready={ready} />}
        </section>

        <aside className="flex flex-col gap-12 lg:col-span-4">
          {funded && <Upcoming items={upcoming(withSchedules, 3)} />}
          <section aria-labelledby="activity" className="flex flex-col gap-4">
            <h2 id="activity" className="text-h3">Activity</h2>
            <Activity events={activity(withSchedules)} />
          </section>
        </aside>
      </div>

      {ready && <QuickApply again={loans.length > 0} />}
    </Container>
  );
}

function NextPayment({ loan, next, schedule }: { loan: Loan; next: NonNullable<ReturnType<typeof nextDue>>; schedule: Installment[] }) {
  return (
    <section aria-labelledby="next" className="grid gap-10 rounded-art bg-surface p-6 shadow-float-1 sm:p-10 lg:grid-cols-12 lg:items-end">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <p id="next" className="text-label text-ink-2">
          Next payment · due {date(next.due_date)}
          {next.status === "overdue" && <span className="text-danger"> · overdue</span>}
        </p>
        <p className="tabular text-display text-ink">{usd(next.remaining)}</p>
      </div>
      <div className="flex flex-col gap-4 lg:col-span-4 lg:items-end lg:text-right">
        <p className="text-body text-ink-2">
          Payment {next.installment_number} of {schedule.length} · Loan {shortId(loan.id)}
        </p>
        <Button to={`/app/loans/${loan.id}`}>Pay or view schedule</Button>
      </div>
      <PaymentStrip installments={schedule} nextId={next.id} className="lg:col-span-12" />
    </section>
  );
}

function Upcoming({ items }: { items: ReturnType<typeof upcoming> }) {
  return (
    <section aria-labelledby="upcoming" className="flex flex-col gap-4">
      <h2 id="upcoming" className="text-h3">Coming up</h2>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map(({ loan, installment: i }) => {
            const d = new Date(`${i.due_date}T00:00:00`);
            const late = i.status === "overdue";
            return (
              <li key={i.id} className="border-t border-line last:border-b">
                <Link to={`/app/loans/${loan.id}`} className="group grid grid-cols-[3.25rem_1fr_auto] items-center gap-4 py-3 transition-colors duration-150 hover:bg-surface">
                  <span className={`flex flex-col items-center rounded-control border py-1 ${late ? "border-danger/40 text-danger" : "border-line"}`}>
                    <span className="text-label uppercase tracking-[0.06em] text-ink-2">{d.toLocaleDateString("en-US", { month: "short" })}</span>
                    <span className="tabular text-h3 leading-none">{d.getDate()}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="tabular text-body font-medium">{usd(i.amount_due - i.amount_paid)}</span>
                    <span className="text-small text-ink-2">{late ? "Overdue · " : ""}Payment {i.installment_number} · {shortId(loan.id)}</span>
                  </span>
                  <span className="text-ink-3 transition-transform duration-250 group-hover:translate-x-1 group-hover:text-ink"><Arrow /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-ink-2">Nothing due. Every payment is made.</p>
      )}
    </section>
  );
}

function EmptyLoans({ ready }: { ready: boolean }) {
  return (
    <div className="grid items-center gap-8 border-t border-line pt-8 sm:grid-cols-[1fr_200px]">
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-[40ch] text-body-lg">No loans yet.</p>
        <p className="max-w-[44ch] text-body text-ink-2">When you apply, your loan shows up here with its status, schedule and documents.</p>
        {ready && <Button to="/app/apply" variant="secondary">Choose an amount</Button>}
      </div>
      <ArtTile src="/img/tile-bakery.webp" className="aspect-[4/3]" />
    </div>
  );
}

const PRESETS = [1000, 2500, 5000];

function QuickApply({ again }: { again: boolean }) {
  return (
    <section aria-labelledby="quick" className="grid items-center gap-8 rounded-art bg-mint-50/60 p-6 sm:p-10 lg:grid-cols-12">
      <div className="flex flex-col gap-3 lg:col-span-5">
        <h2 id="quick" className="text-h2">{again ? "Need more stock or a new tool?" : "Start with an amount"}</h2>
        <p className="max-w-[40ch] text-body text-ink-2">Pick a starting point. You can change the amount and term before you apply.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3 lg:col-span-7">
        {PRESETS.map((a) => (
          <li key={a}>
            <Link
              to={`/app/apply?amount=${a}`}
              className="group flex h-full flex-col gap-1 rounded-control border border-line-strong bg-surface p-5 transition-[border-color,transform] duration-250 hover:-translate-y-0.5 hover:border-ink"
            >
              <span className="tabular text-h2">{usd(a)}</span>
              <span className="tabular text-small text-ink-2">about {usd(Math.round(quote(a, 12).monthly))} a month over 12 months</span>
              <span className="mt-3 inline-flex items-center gap-2 text-small font-medium text-accent-700">Apply <Arrow /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApplyButton({ ready, variant = "primary" }: { ready: boolean; variant?: "primary" | "secondary" }) {
  return ready ? (
    <Button to="/app/apply" variant={variant} size={variant === "primary" ? "lg" : "md"}>Apply for a loan</Button>
  ) : (
    <Button to="/app/setup" size="lg">Continue setup</Button>
  );
}

function Checklist({ steps }: { steps: ReturnType<typeof readiness> }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="before" className="grid gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-2 lg:col-span-4">
        <h2 id="before" className="text-h2">Before you apply</h2>
        <p className="tabular text-body text-ink-2">{done} of {steps.length} done</p>
      </div>
      <ol className="lg:col-span-8">
        {steps.map((s, i) => (
          <li key={s.key} className="border-t border-line last:border-b">
            <Link
              to={`/app/setup?step=${s.key}`}
              className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-5 transition-colors duration-150 hover:bg-surface sm:px-2"
            >
              <span className="tabular text-small text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className={`text-h3 ${s.done ? "text-ink-2" : ""}`}>{s.label}</span>
              {s.done ? (
                <Status tone="accent">Done</Status>
              ) : (
                <span className="inline-flex items-center gap-2 text-body font-medium text-accent-700">
                  Start
                  <Arrow />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LoanTable({ loans }: { loans: Loan[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sr-only sm:not-sr-only">
        <tr className="text-label text-ink-2">
          <th scope="col" className="pb-3 font-medium">Loan</th>
          <th scope="col" className="pb-3 text-right font-medium">Amount</th>
          <th scope="col" className="hidden pb-3 text-right font-medium md:table-cell">Term</th>
          <th scope="col" className="pb-3 pl-8 font-medium">Status</th>
          <th scope="col" className="w-8 pb-3"><span className="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        {loans.map((l) => {
          const s = loanStatus(l);
          const depositDue = l.upfront_required === 1 && l.upfront_paid !== 1 && l.status === "pending";
          return (
            <tr key={l.id} className="group relative border-t border-line transition-colors duration-150 last:border-b hover:bg-surface">
              <td className="py-5 sm:pl-2">
                <Link to={`/app/loans/${l.id}`} className="flex flex-col after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent-600">
                  <span className="tabular text-body font-medium">{shortId(l.id)}</span>
                  <span className="text-small text-ink-2">Applied {date(l.created_at)}</span>
                </Link>
              </td>
              <td className="tabular py-5 text-right text-body">{usd(l.amount)}</td>
              <td className="tabular hidden py-5 text-right text-body text-ink-2 md:table-cell">{l.term_months} months</td>
              <td className="py-5 pl-8">
                <span className="flex flex-col gap-1">
                  <Status tone={s.tone}>{s.label}</Status>
                  {depositDue && <span className="text-small text-warning">Deposit of {usd(l.upfront_amount ?? 0)} due</span>}
                </span>
              </td>
              <td className="py-5 pr-2 text-right text-ink-3 transition-[color,transform] duration-250 group-hover:translate-x-1 group-hover:text-ink"><Arrow /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
