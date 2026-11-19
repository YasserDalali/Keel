import type { StatementData, StatementFacts, StatementPeriod } from "../domain/statement";

/** Turns facts into PDF bytes. The look of the documents is entirely behind this port. */
export interface DocumentRenderer {
  accountOpened(d: { docId: string; userId: string; email: string; createdAt: string }): Promise<Uint8Array>;
  loanAgreement(d: {
    docId: string; loanId: string; borrowerId: string; amount: number; interestRate: number; termMonths: number;
    schedule: { installmentNumber: number; dueDate: string; amountDue: number }[];
  }): Promise<Uint8Array>;
  paymentReceipt(d: {
    docId: string; loanId: string; installmentId: string; installmentNumber: number; installmentCount: number; amountPaid: number;
    paymentMethod: string; installmentStatus: string; paidAt: string; loanRemaining: number;
  }): Promise<Uint8Array>;
  depositReceipt(d: { docId: string; loanId: string; amount: number; loanAmount: number; method: string; paidAt: string }): Promise<Uint8Array>;
  statement(d: StatementData): Promise<Uint8Array>;
}

/** Who the statement is for. Documents asks; it never reads how users and profiles are stored. */
export interface BorrowerDirectory {
  holderOf(userId: string): Promise<{ name: string | null; email: string }>;
}

/** What lending and payments recorded about a borrower in a period. */
export interface LoanSummaries {
  forStatement(userId: string, period: StatementPeriod): Promise<StatementFacts>;
}
