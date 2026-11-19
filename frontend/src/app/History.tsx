import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import {
  download, filterTxns, progressByLoan, toCsv, TXN_LABEL,
  type History as HistoryData, type Milestone, type ScheduleItem, type Txn, type TxnType,
} from "../lib/history";
import { date, loanStatus, shortId, type Loan } from "../lib/loans";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Status } from "../ui/Status";
import { TextField } from "../ui/TextField";
import { LoadError, PageHead, PageSkeleton } from "./AppShell";
import { Bar, MonthlyBars } from "./charts";
import { Select } from "../ui/Select";
import { ArtTile, StatStrip } from "./visuals";

async function load() {
  const [history, { transactions }, { installments }, { loans }] = await Promise.all([
    http<HistoryData>("/history"),
    http<{ transactions: Txn[] }>("/transactions"),
    http<{ installments: ScheduleItem[] }>("/schedule"),
    http<{ loans: Loan[] }>("/loans"),
  ]);
  return { history, transactions, installments, loans };
}

const pct = (n: number) => `${Math.round(n)}%`;
const PAGE = 20;

export default function History() {
  const { data, error, loading } = useLoad(load);
  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  const { history, transactions, installments, loans } = data;
  const s = history.summary;
  const empty = !loans.length;

  return (
    <Container className="flex flex-col gap-16 py-12 lg:gap-24 lg:py-16 print:gap-10 print:py-0" data-stagger>
      <PageHead
        eyebrow="History"
        title="Your financial history"
        intro={
          <>
            Member since {date(s.memberSince)}.{" "}
            {s.paymentsMade
              ? `${s.paymentsMade} ${s.paymentsMade === 1 ? "payment" : "payments"} made${s.onTimeStreak ? `, the last ${s.onTimeStreak} on time` : ""}. Paying on time builds your record with Keel.`
              : "Your record starts with your first payment."}
          </>
        }
        actions={
          !empty && (
            <span className="flex flex-wrap gap-3 print:hidden">
              <Button variant="secondary" onClick={() => window.print()}>Download my history</Button>
            </span>
          )
        }
      />

      {empty ? (
        <div className="grid items-center gap-8 border-t border-line pt-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-12">
          <div className="flex flex-col items-start gap-4">
            <p className="text-body-lg">Nothing here yet.</p>
            <p className="max-w-[46ch] text-body text-ink-2">Loans, payments and milestones collect here, so you can show a lender how reliably you repay.</p>
            <Button to="/app/loans" variant="secondary">Back to loans</Button>
          </div>
          <ArtTile flat contain src="/img/app-history.webp" className="h-[280px] w-full sm:h-[360px]" />
        </div>
      ) : (
        <>
          <StatStrip
            items={[
              { label: "Borrowed", value: s.borrowed },
              { label: "Repaid", value: s.repaid },
              { label: "Still owed", value: s.outstanding, strong: s.outstanding > 0 },
              {
                label: "Paid on time",
                value: s.onTimeRate === null ? 0 : s.onTimeRate * 100,
                format: s.onTimeRate === null ? () => "No payments yet" : pct,
                note: s.onTimeStreak ? `${s.onTimeStreak} in a row` : undefined,
              },
            ]}
          />

          {history.monthly.length > 0 && (
            <section aria-labelledby="monthly" className="flex flex-col gap-6 break-inside-avoid">
              <div className="flex flex-col gap-1">
                <h2 id="monthly" className="text-h2">Month by month</h2>
                <p className="text-body text-ink-2">What was due each month and how much you repaid.</p>
              </div>
              <MonthlyBars data={history.monthly} />
            </section>
          )}

          <div className="grid gap-16 lg:grid-cols-12 lg:gap-10">
            <Progress loans={loans} installments={installments} className="lg:col-span-7" />
            <Milestones items={history.milestones} className="lg:col-span-5" />
          </div>

          <Transactions all={transactions} loans={loans} />
        </>
      )}
    </Container>
  );
}

function Progress({ loans, installments, className }: { loans: Loan[]; installments: ScheduleItem[]; className: string }) {
  const byLoan = new Map(progressByLoan(installments).map((p) => [p.loanId, p]));
  const shown = loans.filter((l) => !(l.status === "defaulted" && !l.approved_at)); // hide declined / cancelled applications
  return (
    <section aria-labelledby="progress" className={`flex flex-col gap-6 ${className}`}>
      <div className="flex flex-col gap-1">
        <h2 id="progress" className="text-h2">Borrowing progress</h2>
        <p className="text-body text-ink-2">How far along each loan is.</p>
      </div>
      {shown.length ? (
        <ul>
          {shown.map((l) => {
            const p = byLoan.get(l.id);
            const st = loanStatus(l);
            return (
              <li key={l.id} className="border-t border-line last:border-b">
                <Link to={`/app/loans/${l.id}`} className="group flex flex-col gap-3 py-5 transition-colors duration-150 hover:bg-surface sm:px-2">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <span className="flex items-baseline gap-3">
                      <span className="tabular text-h3">{usd(l.amount)}</span>
                      <span className="tabular text-small text-ink-2">{shortId(l.id)} · {l.term_months} months</span>
                    </span>
                    <Status tone={st.tone}>{st.label}</Status>
                  </span>
                  {p ? (
                    <>
                      <Bar fraction={p.fraction} label={`Loan ${shortId(l.id)} repaid`} tone={st.tone === "danger" ? "danger" : "accent"} />
                      <span className="tabular flex flex-wrap justify-between gap-x-4 text-small text-ink-2">
                        <span><span className="text-ink">{usd(p.paid)}</span> of {usd(p.due)} · {p.made} of {p.count} payments</span>
                        <span>{p.fraction >= 1 ? "Paid off" : `Ends ${date(p.lastDue)}`}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-small text-ink-2">Schedule starts once approved.</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-ink-2">No approved loans yet.</p>
      )}
    </section>
  );
}

const MILESTONE_DOT: Record<Milestone["kind"], string> = {
  joined: "bg-ink-3", applied: "bg-ink-3", approved: "bg-accent-600", first_payment: "bg-accent-400",
  paid_off: "bg-accent-700", cancelled: "bg-ink-3", declined: "bg-danger",
};

function Milestones({ items, className }: { items: Milestone[]; className: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <section aria-labelledby="milestones" className={`flex flex-col gap-6 ${className}`}>
      <div className="flex flex-col gap-1">
        <h2 id="milestones" className="text-h2">Milestones</h2>
        <p className="text-body text-ink-2">Your record with Keel, newest first.</p>
      </div>
      {items.length ? (
        <>
          <ol className="relative flex flex-col before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-line">
            {shown.map((m, i) => {
              const body = (
                <>
                  <span aria-hidden className={`relative mt-[7px] size-[7px] rounded-full ring-4 ring-canvas ${MILESTONE_DOT[m.kind]}`} />
                  <span className="flex flex-col">
                    <span className={`text-body ${m.kind === "paid_off" || m.kind === "first_payment" ? "font-medium" : ""}`}>{m.text}</span>
                    <span className="tabular text-small text-ink-2">{date(m.date)}</span>
                  </span>
                </>
              );
              return (
                <li key={i}>
                  {m.loanId ? (
                    <Link to={`/app/loans/${m.loanId}`} className="grid grid-cols-[1.25rem_1fr] gap-x-2 rounded-control py-2.5 hover:text-accent-700">{body}</Link>
                  ) : (
                    <div className="grid grid-cols-[1.25rem_1fr] gap-x-2 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
          {items.length > 8 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="self-start rounded-control text-small font-medium text-accent-700 print:hidden">
              {all ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </>
      ) : (
        <p className="text-body text-ink-2">Nothing yet.</p>
      )}
    </section>
  );
}

function Transactions({ all, loans }: { all: Txn[]; loans: Loan[] }) {
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);
  const f = {
    type: (params.get("type") ?? "") as TxnType | "",
    loanId: params.get("loan") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    q: params.get("q") ?? "",
  };
  const rows = filterTxns(all, f);
  const filtered = Object.values(f).some(Boolean);
  const loanIds = [...new Set(all.map((t) => t.loanId))];
  const amountOf = new Map(loans.map((l) => [l.id, l.amount]));
  const moneyIn = rows.filter((t) => t.type === "disbursement").reduce((s, t) => s + t.amount, 0);
  const moneyOut = rows.filter((t) => t.type !== "disbursement" && t.status === "completed").reduce((s, t) => s + t.amount, 0);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
    setLimit(PAGE);
  };

  return (
    <section aria-labelledby="txns" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="txns" className="text-h2">Transactions</h2>
          <p className="tabular text-body text-ink-2" aria-live="polite">
            {rows.length} {rows.length === 1 ? "record" : "records"} · {usd(Math.round(moneyIn * 100) / 100)} received · {usd(Math.round(moneyOut * 100) / 100)} paid
          </p>
        </div>
        <Button variant="secondary" disabled={!rows.length} onClick={() => download("keel-transactions.csv", toCsv(rows), "text/csv")} className="print:hidden">
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] print:hidden">
        <TextField className="col-span-2 lg:col-span-1" label="Search" type="search" value={f.q} onChange={(e) => set("q", e.target.value)} autoComplete="off" />
        <Select label="Type" value={f.type} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {(Object.keys(TXN_LABEL) as TxnType[]).map((t) => <option key={t} value={t}>{TXN_LABEL[t]}</option>)}
        </Select>
        <Select label="Loan" value={f.loanId} onChange={(e) => set("loan", e.target.value)}>
          <option value="">All loans</option>
          {loanIds.map((id) => <option key={id} value={id}>{shortId(id)}{amountOf.has(id) ? ` · ${usd(amountOf.get(id)!)}` : ""}</option>)}
        </Select>
        <TextField label="From" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set("from", e.target.value)} />
        <TextField label="To" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set("to", e.target.value)} />
      </div>
      {filtered && (
        <button type="button" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setLimit(PAGE); }} className="-mt-2 inline-flex min-h-11 items-center self-start rounded-control text-small font-medium text-accent-700 print:hidden">
          Clear filters
        </button>
      )}

      {rows.length ? (
        <>
          <table className="w-full border-collapse text-left">
            <thead className="sr-only sm:not-sr-only">
              <tr className="text-label text-ink-2">
                <th scope="col" className="pb-3 font-medium sm:pl-2">Date</th>
                <th scope="col" className="pb-3 font-medium">What</th>
                <th scope="col" className="hidden pb-3 font-medium md:table-cell">Method</th>
                <th scope="col" className="pb-3 text-right font-medium sm:pr-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((t) => {
                const incoming = t.type === "disbursement";
                return (
                  <tr key={t.id} className="border-t border-line last:border-b">
                    <td className="tabular py-4 align-top text-body sm:pl-2">{date(t.createdAt)}<span className="block text-small text-ink-2 sm:hidden">{TXN_LABEL[t.type]}</span></td>
                    <td className="py-4 align-top">
                      <span className="hidden text-body sm:block">{TXN_LABEL[t.type]}</span>
                      <Link to={`/app/loans/${t.loanId}`} className="tabular text-small text-ink-2 hover:text-accent-700">Loan {shortId(t.loanId)}</Link>
                      {t.status !== "completed" && <Status tone={t.status === "failed" ? "danger" : "warning"} className="mt-1 flex">{t.status === "failed" ? "Failed" : "Pending"}</Status>}
                    </td>
                    <td className="hidden py-4 align-top text-small text-ink-2 md:table-cell">{method(t.method)}</td>
                    <td className={`tabular py-4 text-right align-top text-body sm:pr-2 ${incoming ? "text-accent-700" : ""}`}>
                      <span className="sr-only">{incoming ? "Received " : "Paid "}</span>
                      <span aria-hidden>{incoming ? "+" : "−"}</span>{usd(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > limit && (
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)} className="self-start print:hidden">
              Show {Math.min(PAGE, rows.length - limit)} more
            </Button>
          )}
        </>
      ) : (
        <p className="border-t border-line pt-6 text-body text-ink-2">{filtered ? "No transactions match these filters." : "No transactions yet."}</p>
      )}
      <p className="hidden text-small text-ink-2 print:block">Printed {date(new Date().toISOString())} from Keel. Times in UTC; amounts in USD.</p>
    </section>
  );
}

const METHOD: Record<string, string> = { mock_gateway: "Demo payment", stripe: "Card", paypal: "PayPal", bank_transfer: "Bank transfer", demo: "Demo" };
const method = (m: string) => METHOD[m] ?? m.replace(/_/g, " ");

