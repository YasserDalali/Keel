import type { BorrowerDirectory, LoanSummaries } from "../application/ports";
import type { StatementFacts, StatementPeriod } from "../domain/statement";

/**
 * Who holds the account, as the statement needs it. The facts come from the identity and borrower contexts' own
 * queries, handed in by the composition root, so documents never learns how users or profiles are stored.
 */
export class BorrowerDirectoryGateway implements BorrowerDirectory {
  constructor(
    private readonly account: (userId: string) => Promise<{ email: string } | null>,
    private readonly profile: (userId: string) => Promise<{ firstName: string | null; lastName: string | null } | null>,
  ) {}

  async holderOf(userId: string) {
    const [account, profile] = await Promise.all([this.account(userId).catch(() => null), this.profile(userId).catch(() => null)]);
    return { name: [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || null, email: account?.email ?? "" };
  }
}

// ponytail: reads loans, installments and transactions directly. These become calls to lending's and payments' own
// queries when those expose them.
export class D1LoanSummaries implements LoanSummaries {
  constructor(private readonly db: D1Database) {}

  async forStatement(userId: string, { from, to }: StatementPeriod): Promise<StatementFacts> {
    const [loans, txns, deposits, upcoming] = await Promise.all([
      this.db.prepare(
        `SELECT l.id, l.amount, l.status,
                COALESCE(SUM(i.amount_paid), 0) AS repaid,
                COALESCE(SUM(MAX(i.amount_due - i.amount_paid, 0)), 0) AS outstanding,
                SUM(CASE WHEN i.status != 'paid' THEN 1 ELSE 0 END) AS left_count
           FROM loans l LEFT JOIN installments i ON i.loan_id = l.id
          WHERE l.borrower_id = ? AND l.created_at < ? AND l.cancelled_at IS NULL AND NOT (l.status = 'defaulted' AND l.approved_at IS NULL)
          GROUP BY l.id ORDER BY l.created_at`
      ).bind(userId, to).all<{ id: string; amount: number; status: string; repaid: number; outstanding: number; left_count: number | null }>(),
      this.db.prepare(
        `SELECT t.created_at AS date, t.type, t.loan_id, t.amount FROM transactions t JOIN loans l ON l.id = t.loan_id
          WHERE l.borrower_id = ? AND t.status = 'completed' AND t.created_at >= ? AND t.created_at < ? ORDER BY t.created_at`
      ).bind(userId, from, to).all<{ date: string; type: string; loan_id: string; amount: number }>(),
      this.db.prepare(
        "SELECT id, upfront_amount, upfront_paid_at FROM loans WHERE borrower_id = ? AND upfront_paid = 1 AND upfront_paid_at >= ? AND upfront_paid_at < ?"
      ).bind(userId, from, to).all<{ id: string; upfront_amount: number; upfront_paid_at: string }>(),
      this.db.prepare(
        `SELECT i.due_date, i.loan_id, i.amount_due - i.amount_paid AS amount FROM installments i JOIN loans l ON l.id = i.loan_id
          WHERE l.borrower_id = ? AND l.status = 'active' AND i.status != 'paid' ORDER BY i.due_date LIMIT 3`
      ).bind(userId).all<{ due_date: string; loan_id: string; amount: number }>(),
    ]);

    return {
      loans: loans.results.map((l) => ({ id: l.id, amount: l.amount, status: l.status, repaid: l.repaid, outstanding: l.outstanding, paymentsLeft: l.left_count })),
      movements: [
        ...txns.results.map((t) => ({ date: t.date, type: t.type === "interest_charge" ? "fee" : t.type, loanId: t.loan_id, amount: t.amount })),
        ...deposits.results.map((d) => ({ date: d.upfront_paid_at, type: "deposit", loanId: d.id, amount: d.upfront_amount })),
      ],
      upcoming: upcoming.results.map((u) => ({ dueDate: u.due_date, loanId: u.loan_id, amount: u.amount })),
    };
  }
}
