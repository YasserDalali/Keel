import { dateOf } from "../../../shared/clock";
import { effectiveInstallmentStatus } from "../domain/installment";
import type { LoanDetail, LoanFilter, LoanQueries } from "../application/ports";

/**
 * Read side. Lists and detail views are shaped for the API, not for the domain, so they read rows directly
 * instead of loading aggregates (the usual command/query split). Installment status is derived from today's date.
 */
export class D1LoanQueries implements LoanQueries {
  constructor(private readonly db: D1Database, private readonly today: () => Date) {}

  async list(filter: LoanFilter): Promise<Record<string, unknown>[]> {
    const conditions: string[] = [];
    const binds: unknown[] = [];
    if (filter.borrowerId) { conditions.push("borrower_id = ?"); binds.push(filter.borrowerId); }
    if (filter.status) { conditions.push("status = ?"); binds.push(filter.status); }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const { results } = await this.db.prepare(`SELECT * FROM loans${where} ORDER BY created_at DESC`).bind(...binds).all();
    return results;
  }

  async detail(id: string): Promise<LoanDetail | null> {
    const loan = await this.db.prepare("SELECT * FROM loans WHERE id = ?").bind(id).first<Record<string, unknown> & { borrower_id: string }>();
    if (!loan) return null;
    const { results } = await this.db.prepare("SELECT * FROM installments WHERE loan_id = ? ORDER BY installment_number").bind(id).all<Record<string, unknown> & { status: string; due_date: string }>();
    const today = dateOf(this.today());
    return { loan, installments: results.map((i) => ({ ...i, status: effectiveInstallmentStatus(i.status, i.due_date, today) })) };
  }
}
