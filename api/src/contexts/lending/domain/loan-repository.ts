import type { BorrowingRecord } from "./risk";
import type { Loan } from "./loan";

/**
 * Collection-like access to Loan aggregates. The domain defines what it needs; infrastructure decides how
 * (today D1). `save` must be atomic per aggregate and throw ConcurrentModification when a racing request won.
 */
export interface LoanRepository {
  byId(id: string): Promise<Loan | null>;
  save(loan: Loan): Promise<void>;
  /** Track record of a borrower's loans, for risk assessment (kycStatus is added by the caller). */
  recordOf(borrowerId: string): Promise<Omit<BorrowingRecord, "kycStatus">>;
  /** Stores the overdue state for unpaid installments past due. Returns how many were updated. */
  markOverdue(today: string): Promise<number>;
}
