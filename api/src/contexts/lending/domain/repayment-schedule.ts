import { dateOf } from "../../../shared/clock";
import { Money } from "../../../shared/money";
import { LoanTerms } from "./loan-terms";

export type ScheduledPayment = { number: number; dueDate: string; amountDue: Money };

// Clamping to the last day of the target month avoids Feb 29/30/31 bugs.
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const targetMonth = date.getUTCMonth() + months;
  const daysInTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(date.getUTCFullYear(), targetMonth, Math.min(day, daysInTargetMonth)));
}

/**
 * Domain service: equal monthly payments, with the last one absorbing the rounding so the total is exact.
 * Due dates fall on the same day of each following month.
 */
export function buildRepaymentSchedule(terms: LoanTerms, startsOn: Date): ScheduledPayment[] {
  const total = terms.totalRepayable;
  const base = Money.ofCents(Math.round(total.cents / terms.termMonths));
  const payments: ScheduledPayment[] = [];
  let remaining = total;
  for (let n = 1; n <= terms.termMonths; n++) {
    const amountDue = n === terms.termMonths ? remaining : base;
    remaining = remaining.minus(amountDue);
    payments.push({ number: n, dueDate: dateOf(addMonthsClamped(startsOn, n)), amountDue });
  }
  return payments;
}

/** Plain-number convenience for callers and tests that work in dollars. */
export function generateInstallments(principal: number, flatRate: number, termMonths: number, startsOn: Date) {
  return buildRepaymentSchedule(LoanTerms.of(Money.fromDollars(principal), flatRate, termMonths), startsOn).map((p) => ({
    installmentNumber: p.number,
    dueDate: p.dueDate,
    amountDue: p.amountDue.dollars,
  }));
}
