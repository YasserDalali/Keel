import type { Money } from "../../../shared/money";

/** How money moved. "mock_gateway" is the demo/manual channel. */
export type LedgerMethod = "stripe" | "paypal" | "bank_transfer" | "mock_gateway";

/**
 * The ledger is an append-only record of money movements: nothing in it is ever edited, so entries are
 * immutable facts rather than an aggregate with behaviour. A repayment may carry the id the payment provider gave
 * it (a Stripe PaymentIntent, a PayPal order); the ledger records each such reference at most once.
 */
export interface PaymentLedger {
  recordDisbursement(p: { loanId: string; amount: Money }): Promise<void>;
  /** Returns false when this provider reference was already recorded (a repeat), true when it is new. */
  recordRepayment(p: { loanId: string; installmentId: string; amount: Money; method: LedgerMethod; externalRef?: string }): Promise<boolean>;
  /** Has a repayment with this provider reference already been recorded for this installment? */
  hasRepayment(externalRef: string, installmentId: string): Promise<boolean>;
}

/** Finds the receipt issued for an installment, so a repeated request can return the same document. */
export interface ReceiptLookup {
  forInstallment(installmentId: string): Promise<string | null>;
}
