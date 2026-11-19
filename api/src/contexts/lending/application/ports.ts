import type { DepositPolicy } from "../domain/deposit";

/**
 * Anti-corruption layer towards identity and borrower: lending asks one question in its own words
 * and never sees how users, profiles or bank links are stored.
 */
export type Applicant = {
  emailVerified: boolean;
  /** Identity verification state ("approved" is the only one that lets someone borrow). */
  kycStatus: string;
  /** 0-100, or null when no bank is connected. */
  bankSafetyScore: number | null;
};
export interface ApplicantGateway {
  describe(borrowerId: string): Promise<Applicant>;
}

/** The lender's current policy, read from configuration. */
export type LendingPolicy = { flatRate: number; riskThreshold: number; deposit: DepositPolicy };

export type LoanFilter = { borrowerId?: string; status?: string };
export type LoanDetail = { loan: Record<string, unknown> & { borrower_id: string }; installments: Record<string, unknown>[] };
export interface LoanQueries {
  list(filter: LoanFilter): Promise<Record<string, unknown>[]>;
  detail(id: string): Promise<LoanDetail | null>;
}
