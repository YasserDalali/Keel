import type { Clock } from "../../../shared/clock";
import { dateOf } from "../../../shared/clock";
import { milestones, monthlySeries, summarise } from "../domain/history";
import { DEFAULT_REMINDER_SETTINGS, parseReminderSettings, remindersFor, type ReminderSettings } from "../domain/reminders";
import { scheduleItem, type ScheduleItem } from "../domain/schedule";
import { parseTransactionFilter, selectTransactions } from "../domain/transactions";
import type { HistoryReadModel, ReminderSettingsRepository, ScheduleReadModel, TransactionReadModel } from "./ports";

/** Query services: one per report. The calculations are domain functions; these only fetch, call them and return. */

export class GetSchedule {
  constructor(private rows: ScheduleReadModel, private clock: Clock) {}

  /** Soonest first, with overdue derived from today so it is right even before the daily job stores it. */
  async execute(borrowerId: string): Promise<ScheduleItem[]> {
    const today = dateOf(this.clock.now());
    return (await this.rows.rowsFor(borrowerId)).map((r) => scheduleItem(r, today));
  }
}

export class ListTransactions {
  constructor(private model: TransactionReadModel) {}

  async execute(borrowerId: string, query: { loanId?: string; type?: string; from?: string; to?: string }) {
    const filter = parseTransactionFilter(query); // before any read: a bad filter costs nothing
    return selectTransactions(await this.model.allFor(borrowerId), filter);
  }
}

export class GetReminders {
  constructor(private schedule: GetSchedule, private settings: ReminderSettingsRepository, private clock: Clock) {}

  // ponytail: in-app reminders only, computed on read. Emailing them would mean calling sendTemplate("payment_reminder") from the daily job.
  async execute(borrowerId: string) {
    const settings = (await this.settings.find(borrowerId)) ?? DEFAULT_REMINDER_SETTINGS;
    if (!settings.enabled) return { reminders: [], settings };
    return { reminders: remindersFor(await this.schedule.execute(borrowerId), dateOf(this.clock.now()), settings), settings };
  }
}

export class UpdateReminderSettings {
  constructor(private settings: ReminderSettingsRepository) {}

  async execute(userId: string, body: { enabled?: unknown; daysBefore?: unknown }): Promise<ReminderSettings> {
    const parsed = parseReminderSettings(body);
    await this.settings.save(userId, parsed);
    return parsed;
  }
}

export class GetHistory {
  constructor(private facts: HistoryReadModel, private schedule: GetSchedule) {}

  async execute(borrowerId: string) {
    const [{ memberSince, loans, repayments }, items] = await Promise.all([this.facts.factsFor(borrowerId), this.schedule.execute(borrowerId)]);
    return {
      summary: summarise(loans, items, memberSince),
      monthly: monthlySeries(loans, items, repayments),
      milestones: milestones(memberSince, loans, items),
    };
  }
}
