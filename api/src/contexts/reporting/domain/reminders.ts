import { InvalidReportRequest } from "./errors";
import { cents, daysBetween, type ScheduleItem } from "./schedule";

export type ReminderSettings = { enabled: boolean; daysBefore: number };
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, daysBefore: 3 };

export type ReminderKind = "overdue" | "due_today" | "due_soon";
export type Reminder = {
  installmentId: string; loanId: string; number: number; dueDate: string; amount: number; kind: ReminderKind; daysUntil: number;
};

/** Settings come from the client: on/off and a whole number of days between 1 and 14. */
export function parseReminderSettings(body: { enabled?: unknown; daysBefore?: unknown }): ReminderSettings {
  const { enabled, daysBefore } = body;
  if (typeof enabled !== "boolean" || typeof daysBefore !== "number" || !Number.isInteger(daysBefore) || daysBefore < 1 || daysBefore > 14) {
    throw new InvalidReportRequest("Send { enabled: true|false, daysBefore: whole number 1-14 }");
  }
  return { enabled, daysBefore };
}

/** What needs the borrower's attention: unpaid installments already late, or due within the window. */
export function remindersFor(items: readonly ScheduleItem[], today: string, settings: ReminderSettings): Reminder[] {
  if (!settings.enabled) return [];
  return items
    .filter((i) => i.status !== "paid")
    .map((i) => ({ i, daysUntil: daysBetween(today, i.dueDate) }))
    .filter(({ daysUntil }) => daysUntil <= settings.daysBefore)
    .map(({ i, daysUntil }) => ({
      installmentId: i.id,
      loanId: i.loanId,
      number: i.number,
      dueDate: i.dueDate,
      amount: cents(i.amountDue - i.amountPaid),
      kind: (daysUntil < 0 ? "overdue" : daysUntil === 0 ? "due_today" : "due_soon") as ReminderKind,
      daysUntil,
    }));
}
