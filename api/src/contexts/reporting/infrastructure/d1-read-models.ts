import type { HistoryFacts, HistoryReadModel, ReminderSettingsRepository, ScheduleReadModel, TransactionReadModel } from "../application/ports";
import type { ReminderSettings } from "../domain/reminders";
import type { ScheduleRow, ScheduleStatus } from "../domain/schedule";
import type { Transaction, TransactionType } from "../domain/transactions";

export class D1ScheduleReadModel implements ScheduleReadModel {
  constructor(private readonly db: D1Database) {}

  async rowsFor(borrowerId: string): Promise<ScheduleRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT i.id, i.loan_id, l.amount AS loan_amount, i.installment_number, i.due_date, i.amount_due, i.amount_paid, i.status, i.paid_at,
                (SELECT COUNT(*) FROM installments x WHERE x.loan_id = i.loan_id) AS count
           FROM installments i JOIN loans l ON l.id = i.loan_id
          WHERE l.borrower_id = ?
          ORDER BY i.due_date, i.installment_number`,
      )
      .bind(borrowerId)
      .all<{
        id: string; loan_id: string; loan_amount: number; installment_number: number; due_date: string;
        amount_due: number; amount_paid: number; status: ScheduleStatus; paid_at: string | null; count: number;
      }>();
    return results.map((r) => ({
      id: r.id, loanId: r.loan_id, loanAmount: r.loan_amount, number: r.installment_number, count: r.count,
      dueDate: r.due_date, amountDue: r.amount_due, amountPaid: r.amount_paid, status: r.status, paidAt: r.paid_at,
    }));
  }
}

export class D1TransactionReadModel implements TransactionReadModel {
  constructor(private readonly db: D1Database) {}

  async allFor(borrowerId: string): Promise<Transaction[]> {
    const { results: rows } = await this.db
      .prepare(
        `SELECT t.id, t.loan_id, t.installment_id, t.type, t.amount, t.payment_method, t.status, t.created_at
           FROM transactions t JOIN loans l ON l.id = t.loan_id WHERE l.borrower_id = ?`,
      )
      .bind(borrowerId)
      .all<{ id: string; loan_id: string; installment_id: string | null; type: string; amount: number; payment_method: string; status: string; created_at: string }>();

    // Deposits aren't ledger rows (the table's type CHECK has no 'deposit'); they live on the loan.
    const { results: deposits } = await this.db
      .prepare(
        `SELECT id, upfront_amount, upfront_payment_method, COALESCE(upfront_paid_at, approved_at, updated_at) AS paid_at
           FROM loans WHERE borrower_id = ? AND upfront_paid = 1`,
      )
      .bind(borrowerId)
      .all<{ id: string; upfront_amount: number; upfront_payment_method: string | null; paid_at: string }>();

    return [
      ...rows.map((r) => ({
        id: r.id, loanId: r.loan_id, installmentId: r.installment_id,
        type: (r.type === "disbursement" || r.type === "repayment" ? r.type : "fee") as TransactionType,
        amount: r.amount, method: r.payment_method, status: r.status, createdAt: r.created_at,
      })),
      ...deposits.map((d) => ({
        id: `deposit-${d.id}`, loanId: d.id, installmentId: null, type: "deposit" as const,
        amount: d.upfront_amount, method: d.upfront_payment_method ?? "unknown", status: "completed", createdAt: d.paid_at,
      })),
    ];
  }
}

export class D1ReminderSettingsRepository implements ReminderSettingsRepository {
  constructor(private readonly db: D1Database) {}

  async find(userId: string): Promise<ReminderSettings | null> {
    const row = await this.db.prepare("SELECT enabled, days_before FROM reminder_settings WHERE user_id = ?").bind(userId).first<{ enabled: number; days_before: number }>();
    return row ? { enabled: row.enabled === 1, daysBefore: row.days_before } : null;
  }

  async save(userId: string, s: ReminderSettings): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO reminder_settings (user_id, enabled, days_before) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, days_before = excluded.days_before, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(userId, s.enabled ? 1 : 0, s.daysBefore)
      .run();
  }
}

export class D1HistoryReadModel implements HistoryReadModel {
  constructor(private readonly db: D1Database) {}

  async factsFor(borrowerId: string): Promise<HistoryFacts> {
    const [user, { results: loans }, { results: repayments }] = await Promise.all([
      this.db.prepare("SELECT created_at FROM users WHERE id = ?").bind(borrowerId).first<{ created_at: string }>(),
      this.db
        .prepare("SELECT id, amount, term_months, status, created_at, updated_at, approved_at, cancelled_at FROM loans WHERE borrower_id = ? ORDER BY created_at")
        .bind(borrowerId)
        .all<{ id: string; amount: number; term_months: number; status: string; created_at: string; updated_at: string; approved_at: string | null; cancelled_at: string | null }>(),
      this.db
        .prepare(
          `SELECT t.amount, t.created_at FROM transactions t JOIN loans l ON l.id = t.loan_id
            WHERE l.borrower_id = ? AND t.type = 'repayment' AND t.status = 'completed'`,
        )
        .bind(borrowerId)
        .all<{ amount: number; created_at: string }>(),
    ]);
    return {
      memberSince: user?.created_at ?? null,
      loans: loans.map((l) => ({
        id: l.id, amount: l.amount, termMonths: l.term_months, status: l.status,
        createdAt: l.created_at, updatedAt: l.updated_at, approvedAt: l.approved_at, cancelledAt: l.cancelled_at,
      })),
      repayments: repayments.map((r) => ({ amount: r.amount, createdAt: r.created_at })),
    };
  }
}
