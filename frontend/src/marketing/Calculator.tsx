import { useState } from "react";
import { usd } from "../lib/format";
import { MAX_AMOUNT, MAX_TERM, MIN_AMOUNT, MIN_TERM, quote, UPFRONT_PCT, UPFRONT_THRESHOLD } from "../lib/loan-terms";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Slider } from "../ui/Slider";
import { Ticker } from "../ui/Ticker";

const cents = (n: number) => usd(Math.round(n * 100) / 100);
const whole = (n: number) => usd(Math.round(n));
const months = (n: number) => `${n} months`;

export function Calculator() {
  const [amount, setAmount] = useState(2400);
  const [term, setTerm] = useState(12);
  const q = quote(amount, term);

  return (
    <section id="rates" className="py-24 lg:py-40">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <h2 className="text-h1 max-w-[14ch]">See your monthly payment before you apply</h2>
          <p className="mt-6 max-w-[40ch] text-body-lg text-ink-2">
            One flat 5% fee, shown in dollars before you sign. No interest that grows, no penalties for paying early.
          </p>
        </div>

        <div className="rounded-art bg-surface p-6 shadow-float-1 sm:p-10 lg:col-span-7">
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

          <p className={`mt-6 text-small text-ink-2 transition-opacity duration-250 ${q.upfront ? "opacity-100" : "opacity-0"}`} aria-live="polite">
            {q.upfront > 0 &&
              `Loans over ${usd(UPFRONT_THRESHOLD)} need ${UPFRONT_PCT * 100}% paid upfront (${usd(q.upfront)}) before we send the money.`}
            {!q.upfront && " "}
          </p>

          <Button size="lg" to="/signup" className="mt-6 w-full sm:w-auto">Apply for {usd(amount)}</Button>
        </div>
      </Container>
    </section>
  );
}
