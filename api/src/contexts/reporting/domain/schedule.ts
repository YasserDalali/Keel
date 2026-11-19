import { effectiveInstallmentStatus } from "../../../shared/overdue";
import { Money } from "../../../shared/money";

/** Whole cents, as the API has always rounded money. */
export const cents = (n: number): number => Money.fromDollars(n).dollars;

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export type ScheduleStatus = "paid" | "partial" | "unpaid" | "overdue";

/** One installment as stored, joined with what the report needs to know about its loan. */
export type ScheduleRow = {
  id: string; loanId: string; loanAmount: number; number: number; count: number;
  dueDate: string; amountDue: number; amountPaid: number; status: ScheduleStatus; paidAt: string | null;
};

export type ScheduleItem = ScheduleRow & {
  /** True when settled on or before its due date; false when late; null when not settled. */
  onTime: boolean | null;
};

const statusOn = (status: ScheduleStatus, dueDate: string, today: string): ScheduleStatus => effectiveInstallmentStatus(status, dueDate, today);

/** Overdue is derived from today's date, so every report agrees even before the daily job stores it. */
export function scheduleItem(row: ScheduleRow, today: string): ScheduleItem {
  const settled = row.status === "paid";
  return {
    ...row,
    status: statusOn(row.status, row.dueDate, today),
    onTime: settled && row.paidAt ? row.paidAt.slice(0, 10) <= row.dueDate : null,
  };
}
