import { useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import { date, shortId, type Doc, type Installment, type Loan } from "../lib/loans";
import { gsap, useGSAP, useReducedMotion, EASE_OUT } from "../lib/motion";
import { Button } from "../ui/Button";
import { useDemo } from "../ui/DemoFill";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { Wordmark } from "../ui/Wordmark";
import { downloadPdf } from "./Statements";

type Config = { paypalClientId: string };
/** How the PayPal checkout was paid: the PayPal wallet or its "Debit or Credit Card" option. */
type Method = "paypal" | "card" | "demo";
type Paid = { method: Method; amount: number; documentId?: string; at: Date };
/** Server endpoints for what's being paid: a deposit or one installment. */
type Target = {
  kind: "deposit" | "installment";
  label: string;
  amount: number;
  body: Record<string, string>;
  paypal: { order: string; capture: string };
  /** Demo mode only: records the payment without moving money. */
  demo: { path: string; json?: unknown };
  rows: [string, string][];
  receiptType: Doc["documentType"];
  receiptRef: string;
};

async function load(loanId: string) {
  const [{ loan, installments }, config] = await Promise.all([
    http<{ loan: Loan; installments: Installment[] }>(`/loans/${loanId}`),
    http<Config>("/config"),
  ]);
  return { loan, installments, config };
}

function target(loan: Loan, installments: Installment[], installmentId: string | null): Target | null {
  const owed = installments.reduce((s, i) => s + Math.max(0, i.amount_due - i.amount_paid), 0);
  if (!installmentId) {
    if (!loan.upfront_required || loan.upfront_paid) return null;
    const amount = loan.upfront_amount ?? 0;
    return {
      kind: "deposit",
      label: `Deposit for loan ${shortId(loan.id)}`,
      amount,
      body: { loanId: loan.id },
      paypal: { order: "/payments/paypal/order", capture: "/payments/paypal/capture" },
      demo: { path: `/demo/deposit/${loan.id}` },
      rows: [
        ["Loan", `${shortId(loan.id)} · ${usd(loan.amount)} over ${loan.term_months} months`],
        ["What this is", "5% deposit, needed for loans over $5,000"],
        ["After you pay", "A loan officer can approve your loan"],
      ],
      receiptType: "deposit_receipt",
      receiptRef: loan.id,
    };
  }
  const inst = installments.find((i) => i.id === installmentId);
  if (!inst || inst.status === "paid") return null;
  const amount = Math.round((inst.amount_due - inst.amount_paid) * 100) / 100;
  return {
    kind: "installment",
    label: `Payment ${inst.installment_number} of ${installments.length}`,
    amount,
    body: { loanId: loan.id, installmentId: inst.id },
    paypal: { order: "/payments/paypal/installment-order", capture: "/payments/paypal/installment-capture" },
    demo: { path: `/loans/${loan.id}/installments/${inst.id}/pay`, json: { amount, paymentMethod: "mock_gateway" } },
    rows: [
      ["Loan", `${shortId(loan.id)} · ${usd(loan.amount)} over ${loan.term_months} months`],
      ["Payment", `${inst.installment_number} of ${installments.length}`],
      ["Due", date(inst.due_date) + (inst.status === "overdue" ? " · overdue" : "")],
      ["Left on the loan after this", usd(Math.max(0, Math.round((owed - amount) * 100) / 100))],
    ],
    receiptType: "payment_receipt",
    receiptRef: inst.id,
  };
}

/** Review, pay (card or PayPal) and receipt, on one page in the sign-in layout. `?installment=<id>` or no param for the deposit. */
export default function Checkout() {
  const { loanId = "" } = useParams();
  const [params] = useSearchParams();
  const installmentId = params.get("installment");
  const { data, error, loading } = useLoad(() => load(loanId), [loanId]);
  const [cardMode, setCardMode] = useState(false); // PayPal's card form is open: show only the form
  const [attempt, setAttempt] = useState(0); // remounts the PayPal buttons to leave card mode
  const [paid, setPaid] = useState<Paid | null>(null);
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced || !data) return;
      gsap
        .timeline({ defaults: { ease: EASE_OUT } })
        .from("[data-art]", { clipPath: "inset(0% 0% 0% 100%)", duration: 1.2, ease: "expo.inOut" }, 0)
        .from("[data-art] img", { scale: 1.12, duration: 2.2 }, 0)
        .from("[data-enter]", { y: 16, autoAlpha: 0, duration: 0.6, stagger: 0.06 }, 0.15);
    },
    { scope: root, dependencies: [reduced, !!data, !!paid] },
  );

  const backTo = `/app/loans/${loanId}`;
  const t = data && target(data.loan, data.installments, installmentId);

  async function onPaid(m: Method, documentId?: string) {
    if (!t) return;
    // Find the receipt the server just issued, when the payment response didn't name it.
    let doc = documentId;
    if (!doc) {
      const { documents } = await http<{ documents: Doc[] }>("/documents").catch(() => ({ documents: [] as Doc[] }));
      doc = documents.find((d) => d.documentType === t.receiptType && d.referenceId === t.receiptRef)?.id;
    }
    setPaid({ method: m, amount: t.amount, documentId: doc, at: new Date() });
    toast({ title: "Payment received", body: `${usd(t.amount)} · ${t.label}`, tone: "success" });
  }

  let body: ReactNode;
  if (loading && !data) body = <div className="flex flex-col gap-4"><Skeleton className="h-12 w-3/4" /><Skeleton className="h-40 w-full" /></div>;
  else if (!data) body = <p role="alert" className="text-body text-danger">{error ?? "This payment couldn't be loaded."}</p>;
  else if (paid && t) body = <Receipt t={t} paid={paid} backTo={backTo} />;
  else if (!t)
    body = (
      <div className="flex flex-col items-start gap-6" data-enter>
        <h1 className="text-h1">Nothing to pay here</h1>
        <p className="text-body text-ink-2">This payment is already made, or the loan isn't ready for it yet.</p>
        <Button to={backTo} variant="secondary">Back to your loan</Button>
      </div>
    );
  else
    body = (
      <>
        {cardMode ? (
          <div className="flex items-baseline justify-between gap-6 border-b border-line pb-4">
            <p className="text-body"><span className="tabular font-medium">{usd(t.amount)}</span> <span className="text-ink-2">· {t.label}</span></p>
            <button type="button" onClick={() => { setCardMode(false); setAttempt((n) => n + 1); }} className="shrink-0 rounded-control text-small text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              Other ways to pay
            </button>
          </div>
        ) : (
          <>
            <p className="text-label text-ink-2" data-enter>Review and pay</p>
            <h1 className="mt-3 text-h1" data-enter>{t.label}</h1>
            <p className="tabular mt-6 text-display text-ink" data-enter>{usd(t.amount)}</p>

            <dl className="mt-8 flex flex-col border-t border-line" data-enter>
              {t.rows.map(([k, v]) => <Row key={k} label={k} value={v} />)}
              <Row label="Fee for paying" value="None" />
            </dl>
          </>
        )}

        <div className={`${cardMode ? "mt-6" : "mt-10"} flex flex-col gap-5`} data-enter>
          {!cardMode && <p className="text-label text-ink-2">Pay with PayPal, or a debit or credit card</p>}
          <PayPal
            key={attempt}
            t={t}
            clientId={data.config.paypalClientId}
            onCardMode={setCardMode}
            onPaid={(m, id) => onPaid(m, id)}
          />
          {!cardMode && <DemoPay t={t} onPaid={(id) => onPaid("demo", id)} />}
          <p className="text-small text-ink-2">You'll get a receipt here and in My statements as soon as the payment goes through.</p>
        </div>
      </>
    );

  return (
    <div ref={root} className="grid min-h-dvh lg:grid-cols-12">
      <div className="flex flex-col px-6 py-6 sm:px-10 lg:col-span-6 xl:col-span-5 xl:px-16">
        <div className="flex items-center justify-between gap-6" data-enter>
          <Link to="/app" className="rounded-control text-h3" aria-label="Keel, your account"><Wordmark /></Link>
          <Link to={backTo} className="group inline-flex items-center gap-2 rounded-control text-body text-ink-2 hover:text-ink">
            <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-250 group-hover:-translate-x-1" aria-hidden>
              <path d="M13 8H3M7 4L3 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to your loan
          </Link>
        </div>
        <main className="flex flex-1 flex-col justify-center py-10 sm:py-16">
          <div className="w-full max-w-[440px]">{body}</div>
        </main>
      </div>

      <div data-art className="relative hidden overflow-hidden bg-mint-50 lg:col-span-6 lg:block xl:col-span-7">
        <img src="/img/app-bank.webp" alt="" className="absolute inset-0 size-full object-cover object-[50%_40%]" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className="tabular text-body sm:text-right">{value}</dd>
    </div>
  );
}

function Receipt({ t, paid, backTo }: { t: Target; paid: Paid; backTo: string }) {
  return (
    <div className="flex flex-col" role="status">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-600 text-canvas" data-enter aria-hidden>
        <svg viewBox="0 0 16 16" className="size-6"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <h1 className="mt-6 text-h1" data-enter>Payment received</h1>
      <p className="mt-4 text-body text-ink-2" data-enter>Thank you. Your schedule is updated and your receipt is ready.</p>

      <dl className="mt-8 flex flex-col border-t border-line" data-enter>
        <Row label="Paid" value={usd(paid.amount)} />
        <Row label="For" value={t.label} />
        <Row label="Method" value={paid.method === "card" ? "Debit or credit card (via PayPal)" : paid.method === "demo" ? "Demo payment (no money moved)" : "PayPal"} />
        <Row label="Date" value={paid.at.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} />
      </dl>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row" data-enter>
        {paid.documentId && (
          <Button onClick={() => downloadPdf(paid.documentId!, `keel-receipt-${shortId(paid.documentId!)}.pdf`)}>Download receipt</Button>
        )}
        <Button to={backTo} variant="secondary">Back to your loan</Button>
      </div>
      <Link to="/app/statements" className="mt-6 self-start text-body text-ink-2 hover:text-ink" data-enter>All receipts in My statements</Link>
    </div>
  );
}

/** Same footprint as PayPal's buttons (full width, 48px, 4px corners), so the page doesn't jump when they arrive. */
const BTN = "h-12 w-full rounded-[4px]";

function ButtonsSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading payment options">
      <Skeleton className={BTN} />
      <Skeleton className={BTN} />
    </div>
  );
}

function PayPal({ t, clientId, onPaid, onCardMode }: {
  t: Target; clientId: string; onPaid: (m: Method, documentId?: string) => void; onCardMode: (on: boolean) => void;
}) {
  const [err, setErr] = useState("");
  if (!clientId) return <p role="alert" className="text-body text-danger">Payments aren't set up on this server.</p>;
  return (
    <div className="flex flex-col gap-3">
      {err && <p role="alert" className="text-body text-danger">{err}</p>}
      <PayPalScriptProvider options={{ clientId, currency: "USD", components: "buttons", enableFunding: "card" }}>
        <Buttons t={t} onPaid={onPaid} onCardMode={onCardMode} setErr={setErr} />
      </PayPalScriptProvider>
    </div>
  );
}

function Buttons({ t, onPaid, onCardMode, setErr }: {
  t: Target; onPaid: (m: Method, documentId?: string) => void; onCardMode: (on: boolean) => void; setErr: (e: string) => void;
}) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();
  const [ready, setReady] = useState(false); // the script has loaded AND the buttons have drawn
  const source = useRef<Method>("paypal");
  if (isRejected) return <p role="alert" className="text-body text-danger">PayPal didn't load. Check your connection and refresh the page.</p>;
  return (
    <div className="relative" aria-busy={!ready}>
      {(isPending || !ready) && <ButtonsSkeleton />}
      {/* kept mounted but invisible while loading, so PayPal can measure its width and draw */}
      <div className={ready ? "" : "invisible absolute inset-x-0 top-0"}>
        <PayPalButtons
          style={{ layout: "vertical", tagline: false, height: 48, shape: "rect", color: "gold" }}
          onInit={() => setReady(true)}
          // The "Debit or Credit Card" button expands a long form inline: hide the review so only the form shows.
          onClick={(data) => {
            source.current = data.fundingSource === "card" ? "card" : "paypal";
            onCardMode(source.current === "card");
          }}
          onCancel={() => onCardMode(false)}
          createOrder={async () => (await http<{ orderId: string }>(t.paypal.order, { method: "POST", json: t.body })).orderId}
          onApprove={async ({ orderID }) => {
            try {
              const res = await http<{ documentId?: string }>(t.paypal.capture, { method: "POST", json: { ...t.body, orderId: orderID } });
              onPaid(source.current, res.documentId);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          onError={() => setErr("The payment didn't go through. Try again, or choose another way to pay.")}
        />
      </div>
    </div>
  );
}

/** Demo mode only: a button shaped like PayPal's that records the payment without moving money. */
function DemoPay({ t, onPaid }: { t: Target; onPaid: (documentId?: string) => void }) {
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!demo) return null;

  async function pay() {
    setBusy(true);
    setErr("");
    try {
      const res = await http<{ documentId?: string }>(t.demo.path, { method: "POST", json: t.demo.json });
      onPaid(res.documentId);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        aria-busy={busy || undefined}
        className={`${BTN} flex items-center justify-center gap-2 bg-accent-600 text-body font-semibold text-surface transition-colors duration-150 hover:bg-accent-700 disabled:opacity-60`}
      >
        <span className="rounded-[3px] bg-surface/20 px-1.5 py-0.5 text-label font-medium text-surface">Demo</span>
        {busy ? "Recording payment…" : `Pay ${usd(t.amount)} with demo money`}
      </button>
      {err && <p role="alert" className="text-small text-danger">{err}</p>}
    </div>
  );
}
