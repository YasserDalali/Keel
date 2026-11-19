import type { HistoryLoan, HistoryRepayment } from "../domain/history";
import type { ReminderSettings } from "../domain/reminders";
import type { ScheduleRow } from "../domain/schedule";
import type { Transaction } from "../domain/transactions";

// Read-side ports. Reporting never loads aggregates: it asks for the rows a report needs, shaped for the report.

export interface ScheduleReadModel {
  /** Every installment of the borrower's loans, soonest first. */
  rowsFor(borrowerId: string): Promise<ScheduleRow[]>;
}

export interface TransactionReadModel {
  /** Ledger rows plus one synthesized row per paid deposit (deposits are stored on the loan, not in the ledger). */
  allFor(borrowerId: string): Promise<Transaction[]>;
}

export interface ReminderSettingsRepository {
  find(userId: string): Promise<ReminderSettings | null>;
  save(userId: string, settings: ReminderSettings): Promise<void>;
}

export type HistoryFacts = { memberSince: string | null; loans: HistoryLoan[]; repayments: HistoryRepayment[] };
export interface HistoryReadModel {
  factsFor(borrowerId: string): Promise<HistoryFacts>;
}
