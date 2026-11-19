import { PaymentMismatch, PaymentNotCompleted } from "./errors";
import type { PaymentGateway, PaymentTarget, SettledPayment } from "./gateway";

/**
 * Domain service: a settled payment may be used only if the money really arrived and it was opened for exactly
 * what we are now applying it to. Never trust the client's word for either.
 */
export function verifySettlement(settled: SettledPayment, expected: PaymentTarget, gateway: PaymentGateway): void {
  if (!settled.completed) throw new PaymentNotCompleted(gateway.wording.incomplete(settled.status));
  const t = settled.target;
  const matches = !!t && t.loanId === expected.loanId && t.userId === expected.userId && (t.installmentId ?? undefined) === expected.installmentId;
  if (!matches) throw new PaymentMismatch(`${gateway.wording.noun} does not match ${expected.installmentId ? "this payment" : "loan"}`);
}
