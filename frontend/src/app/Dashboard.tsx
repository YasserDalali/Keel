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
import { TextLink } from "../ui/TextLink";
import { Arrow, LoadError, PageSkeleton } from "./AppShell";
import { Activity, PaymentStrip, StatStrip } from "./visuals";

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
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isWaiting = (l: Loan) => l.status === "pending" || l.status === "under_review";

/**
 * One job per state, in priority order: pay what's due → follow an application → finish setup → start a loan.
 * The focus card carries the page's only primary button; everything below it is reference.
 */
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
  const pending = loans.find(isWaiting);
  const funded = withSchedules.some((l) => l.installments.length);
  const repaying = loans.filter((l) => l.status === "active").length;
  const waiting = loans.filter(isWaiting).length;
  const name = profile.profile?.firstName;

  const summary = repaying
    ? `${plural(repaying, "loan", "loans")} being repaid${waiting ? `, ${waiting} waiting for a decision` : ""}.`
    : waiting ? "Your application is with a loan officer."
    : ready ? "You're set up and ready to apply."
    : "A few short steps and you can apply.";

  const focus =
    active && next ? <PayFocus loan={active.loan} next={next} schedule={active.installments} />
    : pending ? <PendingFocus loan={pending} />
    : !ready ? <SetupFocus steps={steps} />
    : <StartFocus again={loans.length > 0} />;

  // Payments after the featured one, so the same payment never shows twice.
  const later = upcoming(withSchedules, 4).filter((u) => u.installment.id !== next?.id).slice(0, 3);

  return (
    <Container className="flex flex-col gap-12 py-12 lg:gap-16 lg:py-16" data-stagger>
      <header className="flex flex-col gap-2">
        <p className="text-label text-ink-2">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="text-h2">{greeting()}{name ? `, ${name}` : ""}.</h1>
        <p className="max-w-[54ch] text-body text-ink-2">{summary}</p>
      </header>

      {focus}

      {funded && <Overview withSchedules={withSchedules} />}

      {loans.length > 0 && (
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <section aria-labelledby="your-loans" className="flex flex-col gap-4 lg:col-span-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="your-loans" className="text-h3">
                Your loans <span className="tabular text-body text-ink-3">{loans.length}</span>
              </h2>
              {ready && (active || pending) && (
                <TextLink to="/app/apply" className="text-body font-medium text-accent-700">
                  Apply for another <Arrow />
                </TextLink>
              )}
            </div>
            <LoanTable loans={loans} />
          </section>

          <aside className="flex flex-col gap-10 lg:col-span-4">
            {funded && <Later items={later} />}
            <section aria-labelledby="activity" className="flex flex-col gap-3">
              <h2 id="activity" className="text-h3">Recent activity</h2>
              <Activity events={activity(withSchedules)} limit={5} />
              <TextLink to="/app/statements" className="self-start text-small font-medium text-accent-700">
                Receipts and statements <Arrow />
              </TextLink>
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}

/* ---------- focus cards: exactly one renders, each with the page's single primary action ---------- */

function FocusCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-8 rounded-art bg-surface p-6 shadow-float-1 sm:p-10">
      {children}
    </section>
  );
}

function PayFocus({ loan, next, schedule }: { loan: Loan; next: NonNullable<ReturnType<typeof nextDue>>; schedule: Installment[] }) {
  const overdue = next.status === "overdue";
  return (
    <FocusCard label="Next payment">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-2">Next payment</p>
          <p className="tabular text-display text-ink">{usd(next.remaining)}</p>
          <p className="text-body text-ink-2">
            {overdue ? <span className="font-medium text-danger">Overdue · was due {date(next.due_date)}</span> : <>Due {date(next.due_date)}</>}
            <span className="text-ink-3"> · payment {next.installment_number} of {schedule.length} · loan {shortId(loan.id)}</span>
          </p>
        </div>
        <Button to={`/app/loans/${loan.id}`} size="lg" className="w-full sm:w-auto">Pay {usd(next.remaining)}</Button>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <PaymentStrip installments={schedule} nextId={next.id} />
        <TextLink to="/app/schedule" className="self-start text-small font-medium text-accent-700">
          See the full schedule <Arrow />
        </TextLink>
      </div>
    </FocusCard>
  );
}

function PendingFocus({ loan }: { loan: Loan }) {
  const depositDue = loan.upfront_required === 1 && loan.upfront_paid !== 1;
  const steps: { label: string; note?: string; state: "done" | "now" | "todo" }[] = [
    { label: "Application sent", note: date(loan.created_at), state: "done" },
    ...(loan.upfront_required === 1
      ? [{ label: depositDue ? `Pay the ${usd(loan.upfront_amount ?? 0)} deposit` : "Deposit paid", note: depositDue ? "Needed before a decision" : undefined, state: depositDue ? ("now" as const) : ("done" as const) }]
      : []),
    { label: "Loan officer decides", note: "Usually within two business days", state: depositDue ? "todo" : "now" },
    { label: "Money sent, schedule starts", state: "todo" },
  ];
  return (
    <FocusCard label="Your application">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-2">Your application · loan {shortId(loan.id)}</p>
          <p className="tabular text-h1">{usd(loan.amount)} <span className="text-h3 text-ink-2">over {loan.term_months} months</span></p>
          <Status tone={loanStatus(loan).tone}>{loanStatus(loan).label}</Status>
        </div>
        {depositDue ? (
          <Button to={`/app/loans/${loan.id}`} size="lg" className="w-full sm:w-auto">Pay {usd(loan.upfront_amount ?? 0)} deposit</Button>
        ) : (
          <Button to={`/app/loans/${loan.id}`} variant="secondary" className="w-full sm:w-auto">View application</Button>
        )}
      </div>
      <ol aria-label="What happens next" className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.label} aria-current={s.state === "now" ? "step" : undefined} className="flex gap-3">
            <span
              aria-hidden
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${s.state === "done" ? "bg-accent-600" : s.state === "now" ? "bg-canvas ring-2 ring-accent-600" : "bg-line-strong"}`}
            />
            <span className="flex flex-col">
              <span className={`text-body ${s.state === "todo" ? "text-ink-3" : s.state === "now" ? "font-medium" : ""}`}>{s.label}</span>
              {s.note && <span className="text-small text-ink-2">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </FocusCard>
  );
}

function SetupFocus({ steps }: { steps: ReturnType<typeof readiness> }) {
  const done = steps.filter((s) => s.done).length;
  const first = steps.find((s) => !s.done)!;
  return (
    <FocusCard label="Finish setting up">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="tabular text-label text-ink-2">Set up · {done} of {steps.length} done</p>
          <h2 className="text-h2 max-w-[22ch]">Finish setting up to apply</h2>
          <p className="max-w-[48ch] text-body text-ink-2">Each step takes a few minutes. You can stop and pick up where you left off.</p>
        </div>
        <Button to={`/app/setup?step=${first.key}`} size="lg" className="w-full sm:w-auto">{first.label}</Button>
      </div>
      <ol className="flex flex-col border-t border-line">
        {steps.map((s, i) => (
          <li key={s.key} className="border-b border-line last:border-0">
            <Link to={`/app/setup?step=${s.key}`} className="group grid grid-cols-[2rem_1fr_auto] items-center gap-4 py-4 transition-colors duration-150 hover:bg-canvas">
              <span className="tabular text-small text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className={`text-body ${s.done ? "text-ink-2" : "font-medium"}`}>{s.label}</span>
              {s.done ? <Status tone="accent">Done</Status> : <span className="text-ink-3 transition-transform duration-250 group-hover:translate-x-1 group-hover:text-ink"><Arrow /></span>}
            </Link>
          </li>
        ))}
      </ol>
    </FocusCard>
  );
}

const PRESETS = [1000, 2500, 5000];

function StartFocus({ again }: { again: boolean }) {
  return (
    <FocusCard label="Start a loan">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-h2 max-w-[22ch]">{again ? "Ready for your next loan?" : "How much do you need?"}</h2>
          <p className="max-w-[48ch] text-body text-ink-2">Pick a starting amount. You'll see the exact monthly payment and can change it before you apply.</p>
        </div>
        <Button to="/app/apply" size="lg" className="w-full sm:w-auto">Apply for a loan</Button>
      </div>
      <ul className="grid gap-3 border-t border-line pt-6 sm:grid-cols-3">
        {PRESETS.map((a) => (
          <li key={a}>
            <Link
              to={`/app/apply?amount=${a}`}
              className="group flex h-full flex-col gap-1 rounded-control border border-line p-4 transition-[border-color,background-color] duration-250 hover:border-ink hover:bg-canvas"
            >
              <span className="tabular text-h3">{usd(a)}</span>
              <span className="tabular text-small text-ink-2">about {usd(Math.round(quote(a, 12).monthly))} a month for 12 months</span>
            </Link>
          </li>
        ))}
      </ul>
    </FocusCard>
  );
}

/* ---------- reference sections ---------- */

function Overview({ withSchedules }: { withSchedules: LoanWithSchedule[] }) {
  const t = totals(withSchedules);
  return (
    <section aria-label="Overview" className="flex flex-col gap-3">
      <StatStrip
        items={[
          { label: "Still owed", value: t.owed, strong: t.owed > 0 },
          { label: "Repaid", value: t.repaid },
          { label: "Payments left", value: t.paymentsLeft, format: count },
          { label: "Borrowed to date", value: t.borrowed },
        ]}
      />
      <TextLink to="/app/history" className="self-end text-small font-medium text-accent-700">
        Financial history <Arrow />
      </TextLink>
    </section>
  );
}

function Later({ items }: { items: ReturnType<typeof upcoming> }) {
  return (
    <section aria-labelledby="later" className="flex flex-col gap-3">
      <h2 id="later" className="text-h3">After that</h2>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map(({ loan, installment: i }) => {
            const late = i.status === "overdue";
            return (
              <li key={i.id} className="border-t border-line last:border-b">
                <Link to={`/app/loans/${loan.id}`} className="group flex items-baseline justify-between gap-4 py-3 transition-colors duration-150 hover:bg-surface">
                  <span className="flex flex-col">
                    <span className={`tabular text-body ${late ? "text-danger" : ""}`}>{late ? "Overdue · " : ""}{date(i.due_date)}</span>
                    <span className="text-small text-ink-2">Payment {i.installment_number} · loan {shortId(loan.id)}</span>
                  </span>
                  <span className="tabular text-body font-medium">{usd(i.amount_due - i.amount_paid)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-ink-2">Nothing else is due.</p>
      )}
    </section>
  );
}

function LoanTable({ loans }: { loans: Loan[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sr-only sm:not-sr-only">
        <tr className="text-label text-ink-3">
          <th scope="col" className="pb-3 font-medium">Loan</th>
          <th scope="col" className="pb-3 text-right font-medium">Amount</th>
          <th scope="col" className="hidden pb-3 text-right font-medium md:table-cell">Term</th>
          <th scope="col" className="hidden pb-3 pl-8 font-medium sm:table-cell">Status</th>
          <th scope="col" className="w-8 pb-3"><span className="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        {loans.map((l) => {
          const s = loanStatus(l);
          const depositDue = l.upfront_required === 1 && l.upfront_paid !== 1 && l.status === "pending";
          return (
            <tr key={l.id} className="group relative border-t border-line transition-colors duration-150 last:border-b hover:bg-surface">
              <td className="py-4 sm:pl-2">
                <Link to={`/app/loans/${l.id}`} className="flex flex-col after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent-600">
                  <span className="tabular text-body font-medium">{shortId(l.id)}</span>
                  {/* phones: status sits under the id instead of in its own column */}
                  <span className="mt-1 flex flex-col gap-0.5 sm:hidden">
                    <Status tone={s.tone}>{s.label}</Status>
                    {depositDue && <span className="text-small text-warning">Deposit of {usd(l.upfront_amount ?? 0)} due</span>}
                  </span>
                  <span className="mt-1 text-small text-ink-3 sm:mt-0">Applied {date(l.created_at)}</span>
                </Link>
              </td>
              <td className="tabular py-4 text-right align-top text-body sm:align-middle">
                {usd(l.amount)}
                <span className="block text-small text-ink-3 md:hidden">{l.term_months} months</span>
              </td>
              <td className="tabular hidden py-4 text-right text-body text-ink-2 md:table-cell">{l.term_months} months</td>
              <td className="hidden py-4 pl-8 sm:table-cell">
                <span className="flex flex-col gap-1">
                  <Status tone={s.tone}>{s.label}</Status>
                  {depositDue && <span className="text-small text-warning">Deposit of {usd(l.upfront_amount ?? 0)} due</span>}
                </span>
              </td>
              <td className="w-6 py-4 pr-1 pl-2 text-right text-ink-3 sm:w-8 sm:pr-2 transition-[color,transform] duration-250 group-hover:translate-x-1 group-hover:text-ink"><Arrow /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
