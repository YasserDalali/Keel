import { GetHistory, GetReminders, GetSchedule, ListTransactions, UpdateReminderSettings } from "../../contexts/reporting/application/queries";
import {
  D1HistoryReadModel, D1ReminderSettingsRepository, D1ScheduleReadModel, D1TransactionReadModel,
} from "../../contexts/reporting/infrastructure/d1-read-models";
import type { Wiring } from "./shared";

/** Reporting is read-only: query services over D1 read models, no events. */
export function wireReporting({ env, clock }: Wiring) {
  const settings = new D1ReminderSettingsRepository(env.DB);
  const schedule = new GetSchedule(new D1ScheduleReadModel(env.DB), clock);
  return {
    schedule,
    transactions: new ListTransactions(new D1TransactionReadModel(env.DB)),
    reminders: new GetReminders(schedule, settings, clock),
    updateReminderSettings: new UpdateReminderSettings(settings),
    history: new GetHistory(new D1HistoryReadModel(env.DB), schedule),
  };
}
