import type { Money } from "../../../shared/money";

/**
 * What payments needs to know from lending, in payments' own words. The composition root adapts lending's
 * use cases to these, so payments never depends on lending's classes.
 */
export interface DepositQuotes {
  /** Throws a not-found error unless the loan is the caller's. */
  quote(q: { userId: string; loanId: string }): Promise<{ required: boolean; paid: boolean; amount: Money }>;
}
export interface InstallmentQuotes {
  /** Throws a not-found error unless the installment belongs to the caller's active loan. */
  quote(q: { userId: string; loanId: string; installmentId: string }): Promise<{ number: number; remaining: Money }>;
}
export interface DepositCollector {
  /** Tells lending the deposit arrived. Returns the id reserved for the receipt. */
  collect(c: { userId: string; loanId: string; provider: string; reference: string }): Promise<{ documentId: string }>;
}
