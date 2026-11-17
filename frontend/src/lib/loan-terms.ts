// ponytail: mirrors LOAN_FLAT_INTEREST_RATE / LOAN_UPFRONT_* in .dev.vars; drifts if those change. Upgrade: serve them from GET /api/config.
export const FLAT_RATE = 0.05;
export const UPFRONT_THRESHOLD = 5000;
export const UPFRONT_PCT = 0.05;
export const MIN_AMOUNT = 500;
export const MAX_AMOUNT = 10_000;
export const MIN_TERM = 3;
export const MAX_TERM = 24;

const cents = (n: number) => Math.round(n * 100) / 100;

export function quote(amount: number, termMonths: number) {
  const total = cents(amount * (1 + FLAT_RATE));
  return {
    fee: cents(total - amount),
    total,
    monthly: cents(total / termMonths),
    upfront: amount > UPFRONT_THRESHOLD ? cents(amount * UPFRONT_PCT) : 0,
  };
}
