import { DomainError } from "../../../shared/errors";
import { Money } from "../../../shared/money";

export class InvalidStatementMonth extends DomainError {
  constructor() { super("invalid_month", "month must look like YYYY-MM"); }
}

/** One calendar month, `[from, to)` in UTC. */
export class StatementPeriod {
  private constructor(readonly month: string, readonly from: string, readonly to: string) {}

  static of(month: unknown): StatementPeriod {
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new InvalidStatementMonth();
    const from = `${month}-01`;
    const next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return new StatementPeriod(month, from, next.toISOString().slice(0, 10));
  }
}

/** What the lending/payments records say about a borrower in a month. */
export type StatementFacts = {
  loans: { id: string; amount: number; status: string; repaid: number; outstanding: number; paymentsLeft: number | null }[];
  /** Money that moved in the period (disbursements, repayments, deposits), in any order. */
  movements: { date: string; type: string; loanId: string; amount: number }[];
  upcoming: { dueDate: string; loanId: string; amount: number }[];
};

export type StatementData = {
  docId: string;
  month: string;
  holder: { name: string | null; email: string };
  summary: { paidInMonth: number; outstanding: number; activeLoans: number; paymentsLeft: number };
  loans: { id: string; amount: number; status: string; repaid: number; outstanding: number }[];
  transactions: { date: string; type: string; loanId: string; amount: number }[];
  upcoming: { dueDate: string; loanId: string; amount: number }[];
};

const cents = (n: number) => Money.fromDollars(n).dollars;

/** Domain service: turns the facts into the figures a statement shows. */
export function composeStatement(p: { docId: string; period: StatementPeriod; holder: StatementData["holder"]; facts: StatementFacts }): StatementData {
  const transactions = [...p.facts.movements].sort((a, b) => a.date.localeCompare(b.date));
  const active = p.facts.loans.filter((l) => l.status === "active");
  return {
    docId: p.docId,
    month: p.period.month,
    holder: p.holder,
    summary: {
      paidInMonth: cents(transactions.filter((t) => t.type !== "disbursement").reduce((s, t) => s + t.amount, 0)),
      outstanding: cents(active.reduce((s, l) => s + l.outstanding, 0)),
      activeLoans: active.length,
      paymentsLeft: active.reduce((s, l) => s + (l.paymentsLeft ?? 0), 0),
    },
    loans: p.facts.loans.map((l) => ({ id: l.id, amount: l.amount, status: l.status, repaid: cents(l.repaid), outstanding: cents(l.outstanding) })),
    transactions,
    upcoming: p.facts.upcoming.map((u) => ({ ...u, amount: cents(u.amount) })),
  };
}
