import { fromSqlTimestamp, toSqlTimestamp } from "../../../shared/clock";
import { Money } from "../../../shared/money";
import { Deposit } from "../domain/deposit";
import { ConcurrentModification } from "../domain/errors";
import { Installment, type InstallmentStatus } from "../domain/installment";
import { Loan, type LoanStatus } from "../domain/loan";
import type { LoanRepository } from "../domain/loan-repository";
import { LoanTerms } from "../domain/loan-terms";
import { RiskAssessment } from "../domain/risk";

type LoanRow = {
  id: string; borrower_id: string; amount: number; interest_rate: number; term_months: number; status: string;
  risk_assessment_score: number | null; risk_assessment_summary: string | null;
  approved_by: string | null; approved_at: string | null; cancelled_at: string | null; created_at: string;
  upfront_required: number; upfront_amount: number; upfront_paid: number; upfront_payment_id: string | null;
  upfront_payment_method: string | null; upfront_paid_at: string | null;
};
type InstallmentRow = {
  id: string; installment_number: number; due_date: string; amount_due: number; amount_paid: number; status: string; paid_at: string | null;
};

/**
 * The loans table predates the domain model and has one status column for what the domain calls
 * declined, cancelled and defaulted ("defaulted" + approved_at / cancelled_at tell them apart). Only this
 * file knows that; the rest of the code sees the real statuses.
 */
function statusFromRow(row: LoanRow): LoanStatus {
  switch (row.status) {
    case "active": case "approved": return "active";
    case "fully_paid": return "repaid";
    case "defaulted": return row.cancelled_at ? "cancelled" : row.approved_at ? "defaulted" : "declined";
    default: return "pending"; // pending, under_review
  }
}
const legacyStatus = (s: LoanStatus): string =>
  s === "pending" ? "pending" : s === "active" ? "active" : s === "repaid" ? "fully_paid" : "defaulted";

function riskFromRow(row: LoanRow): RiskAssessment | null {
  if (!row.risk_assessment_summary) return null;
  try {
    const s = JSON.parse(row.risk_assessment_summary) as { finalScore: number; bankSafety: number; behavior: number; threshold: number };
    return RiskAssessment.restore(s);
  } catch {
    return null;
  }
}

/** What was on disk when the loan was loaded; used to write only what changed and to detect a racing writer. */
type Loaded = { status: string; depositPaid: number; fingerprint: string; paid: Map<string, number> };

export class D1LoanRepository implements LoanRepository {
  private readonly loaded = new WeakMap<Loan, Loaded>();

  constructor(private readonly db: D1Database) {}

  async byId(id: string): Promise<Loan | null> {
    const row = await this.db.prepare("SELECT * FROM loans WHERE id = ?").bind(id).first<LoanRow>();
    if (!row) return null;
    const { results } = await this.db
      .prepare("SELECT id, installment_number, due_date, amount_due, amount_paid, status, paid_at FROM installments WHERE loan_id = ? ORDER BY installment_number")
      .bind(id)
      .all<InstallmentRow>();

    const loan = Loan.restore({
      id: row.id,
      borrowerId: row.borrower_id,
      terms: LoanTerms.of(Money.fromDollars(row.amount), row.interest_rate, row.term_months),
      risk: riskFromRow(row),
      status: statusFromRow(row),
      deposit: Deposit.restore({
        required: !!row.upfront_required, amount: Money.fromDollars(row.upfront_amount ?? 0), paid: !!row.upfront_paid,
        method: row.upfront_payment_method, reference: row.upfront_payment_id, paidAt: row.upfront_paid_at ? fromSqlTimestamp(row.upfront_paid_at) : null,
      }),
      installments: results.map((r) =>
        Installment.restore({
          id: r.id, number: r.installment_number, dueDate: r.due_date, amountDue: Money.fromDollars(r.amount_due),
          amountPaid: Money.fromDollars(r.amount_paid), status: r.status as InstallmentStatus, paidAt: r.paid_at ? fromSqlTimestamp(r.paid_at) : null,
        }),
      ),
      createdAt: fromSqlTimestamp(row.created_at),
      decidedBy: row.approved_by,
      approvedAt: row.approved_at ? fromSqlTimestamp(row.approved_at) : null,
      cancelledAt: row.cancelled_at ? fromSqlTimestamp(row.cancelled_at) : null,
    });
    this.remember(loan, row.status, row.upfront_paid, new Map(results.map((r) => [r.id, r.amount_paid])));
    return loan;
  }

  async save(loan: Loan): Promise<void> {
    const before = this.loaded.get(loan);
    if (!before) return this.insert(loan);

    const statements: D1PreparedStatement[] = [];
    let guarded = false;

    // Loan-level changes, guarded so a racing request that already moved the loan makes this one fail.
    if (this.fingerprint(loan) !== before.fingerprint) {
      guarded = true;
      statements.push(
        this.db
          .prepare(
            `UPDATE loans SET status = ?, approved_by = ?, approved_at = ?, cancelled_at = ?, upfront_paid = ?, upfront_payment_id = ?,
               upfront_payment_method = ?, upfront_paid_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = ? AND upfront_paid = ?`,
          )
          .bind(
            legacyStatus(loan.status), loan.decidedBy, this.ts(loan.approvedAt), this.ts(loan.cancelledAt),
            loan.deposit.paid ? 1 : 0, loan.deposit.reference, loan.deposit.method, this.ts(loan.deposit.paidAt),
            loan.id, before.status, before.depositPaid,
          ),
      );
    }

    // Installments: new ones are inserted (only if our approval really landed), changed ones are guarded on the
    // amount that was read, so two payments racing can't overwrite each other.
    const conditionalUpdates: number[] = [];
    for (const i of loan.installments) {
      const was = before.paid.get(i.id);
      if (was === undefined) {
        statements.push(
          this.db
            .prepare(
              `INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due)
               SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM loans WHERE id = ? AND approved_at = ?)`,
            )
            .bind(i.id, loan.id, i.number, i.dueDate, i.amountDue.dollars, loan.id, this.ts(loan.approvedAt)),
        );
      } else if (was !== i.amountPaid.dollars) {
        conditionalUpdates.push(statements.length);
        statements.push(
          this.db
            .prepare("UPDATE installments SET amount_paid = ?, status = ?, paid_at = ? WHERE id = ? AND amount_paid = ?")
            .bind(i.amountPaid.dollars, i.status, this.ts(i.paidAt), i.id, was),
        );
      }
    }
    if (statements.length === 0) return;

    // Order matters. An approval inserts new installments that check the loan row already says "approved", so the
    // loan update goes first. A payment updates installments, and the loan only follows if those updates won.
    const loanStmt = guarded ? statements.shift()! : null;
    const approving = loan.installments.some((i) => !before.paid.has(i.id));
    const ordered = !loanStmt ? statements : approving ? [loanStmt, ...statements] : [...statements, loanStmt];
    const results = await this.db.batch(ordered);

    const loanResult = loanStmt ? results[approving ? 0 : results.length - 1] : null;
    if (loanResult && loanResult.meta.changes === 0) throw new ConcurrentModification();
    const offset = loanStmt && approving ? 1 : 0;
    for (const idx of conditionalUpdates) if (results[idx - (loanStmt ? 1 : 0) + offset].meta.changes === 0) throw new ConcurrentModification();

    this.remember(loan, legacyStatus(loan.status), loan.deposit.paid ? 1 : 0, new Map(loan.installments.map((i) => [i.id, i.amountPaid.dollars])));
  }

  async recordOf(borrowerId: string) {
    const counts = await this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'fully_paid' THEN 1 ELSE 0 END), 0) AS fully_paid,
           COALESCE(SUM(CASE WHEN status = 'defaulted' AND approved_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS defaulted
         FROM loans WHERE borrower_id = ?`,
      )
      .bind(borrowerId)
      .first<{ fully_paid: number; defaulted: number }>();
    const overdue = await this.db
      .prepare("SELECT COUNT(*) AS n FROM installments i JOIN loans l ON l.id = i.loan_id WHERE l.borrower_id = ? AND i.status = 'overdue'")
      .bind(borrowerId)
      .first<{ n: number }>();
    return { fullyPaidLoans: counts?.fully_paid ?? 0, defaultedLoans: counts?.defaulted ?? 0, overdueInstallments: overdue?.n ?? 0 };
  }

  async markOverdue(today: string): Promise<number> {
    const r = await this.db.prepare("UPDATE installments SET status = 'overdue' WHERE status IN ('unpaid', 'partial') AND due_date < ?").bind(today).run();
    return r.meta.changes;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async insert(loan: Loan): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status, risk_assessment_score, risk_assessment_summary,
           upfront_required, upfront_amount, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      )
      .bind(
        loan.id, loan.borrowerId, loan.terms.principal.dollars, loan.terms.flatRate, loan.terms.termMonths,
        loan.risk?.finalScore ?? null, loan.risk ? JSON.stringify(loan.risk.summary()) : null,
        loan.deposit.required ? 1 : 0, loan.deposit.amount.dollars, toSqlTimestamp(loan.createdAt),
      )
      .run();
    this.remember(loan, "pending", 0, new Map());
  }

  private remember(loan: Loan, status: string, depositPaid: number, paid: Map<string, number>) {
    this.loaded.set(loan, { status, depositPaid, fingerprint: this.fingerprint(loan), paid });
  }

  private fingerprint(loan: Loan): string {
    return JSON.stringify([legacyStatus(loan.status), loan.decidedBy, this.ts(loan.approvedAt), this.ts(loan.cancelledAt), loan.deposit.paid, loan.deposit.reference, loan.deposit.method]);
  }

  private ts(d: Date | null): string | null {
    return d ? toSqlTimestamp(d) : null;
  }
}
