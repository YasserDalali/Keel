import type { DomainEvent } from "../../../shared/events";

// Past-tense facts other contexts may react to. Amounts are plain dollars so subscribers need not know `Money`.
// `documentId` is reserved by the command so the caller can return it; the Documents context renders the PDF under that id.

export type LoanApplied = DomainEvent & {
  type: "lending.loan-applied";
  loanId: string; borrowerId: string; amount: number; termMonths: number;
};
export type LoanApproved = DomainEvent & {
  type: "lending.loan-approved";
  loanId: string; borrowerId: string; approvedBy: string | null;
  amount: number; flatRate: number; termMonths: number;
  schedule: { number: number; dueDate: string; amountDue: number }[];
  documentId: string;
};
export type LoanDeclined = DomainEvent & { type: "lending.loan-declined"; loanId: string; borrowerId: string; amount: number };
export type LoanCancelled = DomainEvent & { type: "lending.loan-cancelled"; loanId: string; borrowerId: string; amount: number };
export type DepositPaid = DomainEvent & {
  type: "lending.deposit-paid";
  loanId: string; borrowerId: string; depositAmount: number; loanAmount: number; method: string; documentId: string;
};
export type InstallmentPaid = DomainEvent & {
  type: "lending.installment-paid";
  loanId: string; borrowerId: string; installmentId: string; number: number; count: number;
  amount: number; status: "paid" | "partial"; remaining: number; method: string; documentId: string;
};
export type LoanRepaid = DomainEvent & { type: "lending.loan-repaid"; loanId: string; borrowerId: string };

export type LendingEvent = LoanApplied | LoanApproved | LoanDeclined | LoanCancelled | DepositPaid | InstallmentPaid | LoanRepaid;
