import { lazy, Suspense, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { http, TOKEN_KEY, useLoad } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usd } from "../lib/format";
import { date, INSTALLMENT, lifecycle, loanStatus, nextDue, progress, shortId, type Doc, type Installment, type Loan } from "../lib/loans";
import { Button } from "../ui/Button";
import { DemoButton } from "../ui/DemoFill";
import { Container } from "../ui/Container";
import { Dialog } from "../ui/Dialog";
import { Status } from "../ui/Status";
import { LoadError, PageSkeleton } from "./AppShell";
import { ArtTile, PaymentStrip, Stepper } from "./visuals";

const UpfrontDialog = lazy(() => import("./UpfrontDialog"));

async function load(id: string) {
  const [{ loan, installments }, { documents }] = await Promise.all([
    http<{ loan: Loan; installments: Installment[] }>(`/loans/${id}`),
    http<{ documents: Doc[] }>("/documents").catch(() => ({ documents: [] as Doc[] })),
  ]);
  const refs = new Set([id, ...installments.map((i) => i.id)]);
  return { loan, installments, documents: documents.filter((d) => d.referenceId && refs.has(d.referenceId)) };
}

export default function LoanDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const staff = user?.role !== "borrower";
  const justApplied = (useLocation().state as { justApplied?: boolean } | null)?.justApplied;
  const { data, error, loading, reload } = useLoad(() => load(id), [id]);
  const [depositOpen, setDepositOpen] = useState(false);
  const [paying, setPaying] = useState<ReturnType<typeof nextDue>>(null);
  const [notice, setNotice] = useState(justApplied ? "Application sent. A loan officer usually decides within two business days." : "");

  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  const { loan, installments, documents } = data;
  const s = loanStatus(loan);
  const total = Math.round(loan.amount * (1 + loan.interest_rate) * 100) / 100;
  const next = nextDue(installments);
  const depositDue = loan.upfront_required === 1 && loan.upfront_paid !== 1 && loan.status === "pending";
  const instNumber = new Map(installments.map((i) => [i.id, i.installment_number]));
  const monthly = installments[0]?.amount_due ?? Math.round((total / loan.term_months) * 100) / 100;
  const active = loan.status === "active" && installments.length > 0;
  const owed = Math.round(installments.reduce((sum, i) => sum + Math.max(0, i.amount_due - i.amount_paid), 0) * 100) / 100;
  const left = installments.filter((i) => i.status !== "paid").length;
  const payoff = [...installments].sort((a, b) => a.installment_number - b.installment_number).at(-1)?.due_date;

  return (
    <Container className="flex flex-col gap-16 py-12 lg:gap-24 lg:py-16" data-stagger>
      <header className="flex flex-col gap-6">
        <Link to={staff ? "/app/queue" : "/app/loans"} className="group inline-flex items-center gap-2 self-start rounded-control text-body text-ink-2 hover:text-ink">
          <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-250 group-hover:-translate-x-1" aria-hidden>
            <path d="M13 8H3M7 4L3 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {staff ? "Review queue" : "All loans"}
        </Link>
        <div className="flex flex-col gap-3">
          <p className="tabular text-label text-ink-2">Loan {shortId(loan.id)}</p>
          <h1 className="tabular text-h1">{usd(loan.amount)} over {loan.term_months} months</h1>
          <Status tone={s.tone} className="mt-1">{s.label}</Status>
        </div>
        <p role="status" className="max-w-[60ch] text-body text-accent-700 empty:hidden">{notice}</p>
        <div className="mt-4 border-t border-line pt-6">
          <Stepper steps={lifecycle(loan, installments)} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-line pt-8 lg:grid-cols-4">
        {active ? (
          <>
            <Figure label="Monthly payment" value={usd(monthly)} strong />
            <Figure label="Still owed" value={usd(owed)} />
            <Figure label="Payments left" value={`${left} of ${installments.length}`} />
            <Figure label="Payoff date" value={payoff ? date(payoff) : "—"} />
          </>
        ) : (
          <>
            <Figure label="Monthly payment" value={usd(monthly)} strong />
            <Figure label="Total to repay" value={usd(total)} />
            <Figure label="Fee" value={`${usd(Math.round((total - loan.amount) * 100) / 100)} · ${Math.round(loan.interest_rate * 100)}% flat`} />
            <Figure label={loan.approved_at ? "Approved" : "Applied"} value={date(loan.approved_at ?? loan.created_at)} />
          </>
        )}
      </dl>

      {depositDue && !staff && (
        <section aria-labelledby="deposit" className="grid gap-6 rounded-art bg-surface p-6 shadow-float-1 sm:p-10 lg:grid-cols-12 lg:items-center">
          <div className="flex flex-col gap-2 lg:col-span-8">
            <h2 id="deposit" className="text-h2">Pay your {usd(loan.upfront_amount ?? 0)} deposit</h2>
            <p className="max-w-[52ch] text-body text-ink-2">Loans over $5,000 need 5% upfront. A loan officer can approve this loan once it's paid.</p>
          </div>
          <div className="lg:col-span-4 lg:justify-self-end">
            <Button size="lg" onClick={() => setDepositOpen(true)}>Pay deposit</Button>
          </div>
        </section>
      )}
      {loan.upfront_required === 1 && loan.upfront_paid === 1 && (
        <p className="-mt-8 text-body text-ink-2 lg:-mt-16"><Status tone="accent">Deposit paid</Status> <span className="tabular">{usd(loan.upfront_amount ?? 0)}</span></p>
      )}

      {!staff && loan.status === "pending" && (
        <WhileYouWait
          loan={loan}
          onCancelled={() => { setNotice("Application cancelled."); reload(); }}
          onApproved={() => { setNotice("Approved (demo). Your schedule is ready."); reload(); }}
        />
      )}

      <Schedule installments={installments} loan={loan} next={next} canPay={!staff && loan.status === "active"} onPay={setPaying} />

      {documents.length > 0 && (
        <section aria-labelledby="docs" className="flex flex-col gap-6">
          <h2 id="docs" className="text-h2">Documents</h2>
          <ul>
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-6 border-t border-line py-4 last:border-b">
                <span className="flex flex-col">
                  <span className="text-body font-medium">
                    {d.documentType === "loan_agreement" ? "Loan agreement" : `Receipt · payment ${instNumber.get(d.referenceId!) ?? ""}`}
                  </span>
                  <span className="text-small text-ink-2">{date(d.createdAt)} · PDF</span>
                </span>
                <Button variant="secondary" onClick={() => openPdf(d.id)}>Open</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {depositOpen && (
        <Suspense fallback={null}>
          <UpfrontDialog
            loanId={loan.id}
            amount={loan.upfront_amount ?? 0}
            open
            onClose={() => setDepositOpen(false)}
            onPaid={() => {
              setDepositOpen(false);
              setNotice("Deposit paid. Your application is with a loan officer.");
              reload();
            }}
          />
        </Suspense>
      )}

      <PayDialog
        loanId={loan.id}
        installment={paying}
        onClose={() => setPaying(null)}
        onPaid={(n) => {
          setPaying(null);
          setNotice(`Payment ${n} recorded. A receipt is in your documents.`);
          reload();
        }}
      />
    </Container>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className={`tabular ${strong ? "text-h2 text-accent-700" : "text-h3"}`}>{value}</dd>
    </div>
  );
}

function Schedule({ installments, loan, next, canPay, onPay }: {
  installments: Installment[]; loan: Loan; next: ReturnType<typeof nextDue>; canPay: boolean; onPay: (i: ReturnType<typeof nextDue>) => void;
}) {
  if (!installments.length) {
    const s = loanStatus(loan);
    return (
      <section aria-labelledby="schedule" className="flex flex-col gap-4 border-t border-line pt-8">
        <h2 id="schedule" className="text-h2">Repayment schedule</h2>
        <p className="max-w-[56ch] text-body text-ink-2">
          {s.label === "Not approved"
            ? "This application wasn't approved, so there is nothing to repay."
            : s.label === "Cancelled"
              ? "You cancelled this application, so there is nothing to repay."
              : "Your schedule appears here as soon as a loan officer approves the loan."}
        </p>
      </section>
    );
  }
  const p = progress(installments);
  return (
    <section aria-labelledby="schedule" className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h2 id="schedule" className="text-h2">Repayment schedule</h2>
        <PaymentStrip installments={installments} nextId={next?.id} />
        <p className="tabular text-small text-ink-2"><span className="text-ink">{usd(p.paid)}</span> of {usd(p.total)} repaid</p>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-label text-ink-2">
            <th scope="col" className="w-12 pb-3 font-medium">#</th>
            <th scope="col" className="pb-3 font-medium">Due</th>
            <th scope="col" className="pb-3 text-right font-medium">Amount</th>
            <th scope="col" className="hidden pb-3 pl-8 font-medium sm:table-cell">Status</th>
            <th scope="col" className="pb-3"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {installments.map((i) => {
            const st = INSTALLMENT[i.status];
            const isNext = next?.id === i.id;
            return (
              <tr key={i.id} className={`border-t border-line last:border-b ${isNext ? "bg-surface" : ""}`}>
                <td className="tabular py-4 text-small text-ink-3 sm:pl-2">{String(i.installment_number).padStart(2, "0")}</td>
                <td className="tabular py-4 text-body">
                  {date(i.due_date)}
                  <Status tone={st.tone} className="mt-1 flex sm:hidden">{st.label}</Status>
                </td>
                <td className="tabular py-4 text-right text-body">
                  {usd(i.amount_due)}
                  {i.status === "partial" && <span className="block text-small text-ink-2">{usd(i.amount_paid)} paid</span>}
                </td>
                <td className="hidden py-4 pl-8 sm:table-cell"><Status tone={st.tone}>{st.label}</Status></td>
                <td className="py-4 pr-2 text-right">
                  {isNext && canPay && <Button variant="secondary" onClick={() => onPay(next)}>Pay {usd(next!.remaining)}</Button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function WhileYouWait({ loan, onCancelled, onApproved }: { loan: Loan; onCancelled: () => void; onApproved: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "approve" | null>(null);
  const [err, setErr] = useState("");

  async function run(kind: "cancel" | "approve") {
    setBusy(kind);
    setErr("");
    try {
      await http(kind === "cancel" ? `/loans/${loan.id}/cancel` : `/demo/approve/${loan.id}`, { method: "POST" });
      setConfirm(false);
      (kind === "cancel" ? onCancelled : onApproved)();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="wait" className="grid gap-8 lg:grid-cols-12 lg:items-center">
      <div className="flex flex-col gap-4 lg:col-span-7">
        <h2 id="wait" className="text-h2">While you wait</h2>
        <p className="max-w-[52ch] text-body text-ink-2">
          A loan officer reviews your bank activity and history, usually within two business days. Changed your mind? You can withdraw until it's approved.
        </p>
        {loan.upfront_paid === 1 ? (
          <p className="max-w-[52ch] text-body text-ink-2">Your deposit is paid, so cancelling needs a person. Contact Keel.</p>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => { setErr(""); setConfirm(true); }}>Cancel application</Button>
          </div>
        )}
        <DemoButton label="Approve this loan" onClick={() => run("approve")} busy={busy === "approve"} />
        {err && !confirm && <p role="alert" className="text-body text-danger">{err}</p>}
      </div>
      <ArtTile src="/img/tile-cart.webp" className="hidden aspect-[4/3] lg:col-span-4 lg:col-start-9 lg:block" />

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Cancel this application?">
        <p className="text-body text-ink-2">
          {shortId(loan.id)} for {usd(loan.amount)} will be withdrawn. You can apply again any time.
        </p>
        {err && <p role="alert" className="text-body text-danger">{err}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Keep it</Button>
          <Button variant="secondary" className="border-danger/40 text-danger hover:border-danger" loading={busy === "cancel"} onClick={() => run("cancel")}>
            Cancel application
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

function PayDialog({ loanId, installment, onClose, onPaid }: { loanId: string; installment: ReturnType<typeof nextDue>; onClose: () => void; onPaid: (n: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pay() {
    if (!installment) return;
    setBusy(true);
    setErr("");
    try {
      await http(`/loans/${loanId}/installments/${installment.id}/pay`, { method: "POST", json: { amount: installment.remaining, paymentMethod: "mock_gateway" } });
      onPaid(installment.installment_number);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!installment} onClose={onClose} title={installment ? `Pay ${usd(installment.remaining)} for payment ${installment.installment_number}` : ""}>
      <p className="text-body text-ink-2">
        This is a demo payment: no money moves, but the payment is recorded on your schedule and a receipt is issued. It can't be undone.
      </p>
      {err && <p role="alert" className="text-body text-danger">{err}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={pay} loading={busy}>Record demo payment</Button>
      </div>
    </Dialog>
  );
}

async function openPdf(id: string) {
  // ponytail: popup opened before the fetch so blockers allow it; the blob URL is never revoked (one per click, freed on tab close).
  const tab = window.open("", "_blank");
  const res = await fetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } });
  if (!res.ok) {
    tab?.close();
    alert("That document couldn't be opened. Try again.");
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else location.href = url;
}
