import type { LoanApproved } from "../../lending/domain/events";
import type { EventBus } from "../../../shared/events";
import { Money } from "../../../shared/money";
import type { PaymentLedger } from "../domain/ledger";

/** Payments reacts to lending: an approved loan means the principal was paid out. */
export function subscribePaymentsToLending(bus: EventBus, ledger: PaymentLedger) {
  bus.subscribe<LoanApproved>("lending.loan-approved", (e) => ledger.recordDisbursement({ loanId: e.loanId, amount: Money.fromDollars(e.amount) }));
}
