import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError, http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import { MAX_AMOUNT, MAX_TERM, MIN_AMOUNT, MIN_TERM, quote, UPFRONT_PCT, UPFRONT_THRESHOLD } from "../lib/loan-terms";
import { readiness, type Profile } from "../lib/loans";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Slider } from "../ui/Slider";
import { TextLink } from "../ui/TextLink";
import { Ticker } from "../ui/Ticker";
import { LoadError, PageSkeleton } from "./AppShell";
import { ArtTile } from "./visuals";

const cents = (n: number) => usd(Math.round(n * 100) / 100);
const whole = (n: number) => usd(Math.round(n));
const months = (n: number) => `${n} months`;

/** `?amount=2500` presets the slider; anything else falls back to the default. */
function initialAmount(raw: string | null) {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return 2400;
  return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(n / 100) * 100));
}

const NEXT = [
  "A loan officer reviews it, usually within two business days.",
  "Loans over $5,000: pay the 5% deposit.",
  "Once approved, the money is sent and your schedule starts.",
];

type Problem = { text: string; fix?: { label: string; to: string } };

function problem(e: unknown): Problem {
  if (!(e instanceof ApiError)) return { text: "Something went wrong. Try again." };
  if (e.status === 428) return { text: "Connect your bank before applying.", fix: { label: "Connect your bank", to: "/app/setup?step=bank" } };
  if (e.status === 403 && /KYC/i.test(e.message)) return { text: "Verify your ID before applying.", fix: { label: "Verify your ID", to: "/app/setup?step=identity" } };
  if (e.status === 403) return { text: "We can't offer a loan right now based on your bank activity and history. Paying off any open loan on time helps next time." };
  return { text: e.message };
}

export default function Apply() {
  const { data: profile, error, loading } = useLoad(() => http<Profile>("/profile"));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [amount, setAmount] = useState(() => initialAmount(params.get("amount")));
  const [term, setTerm] = useState(12);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<Problem | null>(null);
  const q = quote(amount, term);

  if (loading && !profile) return <PageSkeleton />;
  if (!profile) return <LoadError message={error} />;
  const missing = readiness(profile).filter((s) => !s.done);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setIssue(null);
    try {
      const loan = await http<{ id: string }>("/loans", { method: "POST", json: { amount, termMonths: term } });
      navigate(`/app/loans/${loan.id}`, { state: { justApplied: true } });
    } catch (err) {
      setIssue(problem(err));
      setBusy(false);
    }
  }

  return (
    <Container className="grid gap-12 py-12 lg:grid-cols-12 lg:gap-10 lg:py-16" data-stagger>
      <div className="flex flex-col gap-6 lg:col-span-5">
        <p className="text-label text-ink-2">Apply</p>
        <h1 className="text-h1 max-w-[12ch]">How much do you need?</h1>
        <p className="max-w-[40ch] text-body-lg text-ink-2">
          One flat 5% fee, shown in dollars. A loan officer reviews your application, usually within two business days.
        </p>
        <div className="mt-4 hidden flex-col gap-8 lg:flex">
          <ArtTile src="/img/tile-cart.webp" className="aspect-[4/3] w-full max-w-[420px]" />
          <section aria-labelledby="next-steps" className="flex flex-col gap-4">
            <h2 id="next-steps" className="text-label text-ink-2">What happens next</h2>
            <ol className="flex flex-col">
              {NEXT.map((t, i) => (
                <li key={t} className="grid grid-cols-[2.5rem_1fr] border-t border-line py-3 last:border-b">
                  <span className="tabular text-small text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-body">{t}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {missing.length ? (
        <div className="flex flex-col items-start gap-6 border-t border-line pt-8 lg:col-span-7">
          <h2 className="text-h2 max-w-[22ch]">Finish setting up first</h2>
          <p className="text-body text-ink-2">Still to do: {missing.map((s) => s.label.toLowerCase()).join(", ")}.</p>
          <Button to={`/app/setup?step=${missing[0].key}`} size="lg">Continue setup</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-art bg-surface p-6 shadow-float-1 sm:p-10 lg:col-span-7">
          <div className="flex flex-col gap-10">
            <Slider label="Amount" value={amount} min={MIN_AMOUNT} max={MAX_AMOUNT} step={100} format={usd} onChange={setAmount} />
            <Slider label="Repay over" value={term} min={MIN_TERM} max={MAX_TERM} step={1} format={months} onChange={setTerm} />
          </div>

          <div className="mt-10 grid gap-8 border-t border-line pt-8 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1">
              <span className="text-body text-ink-2">Monthly payment</span>
              <Ticker value={q.monthly} format={cents} className="tabular text-h1 text-accent-700" />
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-small sm:text-right">
              <dt className="text-ink-2">Total repaid</dt>
              <dd className="tabular"><Ticker value={q.total} format={whole} /></dd>
              <dt className="text-ink-2">Fee</dt>
              <dd className="tabular"><Ticker value={q.fee} format={whole} /></dd>
            </dl>
          </div>

          <p className="mt-6 min-h-[1.5em] text-small text-ink-2" aria-live="polite">
            {q.upfront > 0 &&
              `Over ${usd(UPFRONT_THRESHOLD)}, ${UPFRONT_PCT * 100}% (${usd(q.upfront)}) is paid upfront once you apply, before the money is sent.`}
          </p>

          {issue && (
            <p role="alert" className="mt-4 text-body text-danger">
              {issue.text} {issue.fix && <TextLink to={issue.fix.to} className="font-medium">{issue.fix.label}</TextLink>}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Button type="submit" size="lg" loading={busy}>Apply for {usd(amount)}</Button>
            <p className="text-small text-ink-2">Nothing is charged when you apply.</p>
          </div>
        </form>
      )}
    </Container>
  );
}
