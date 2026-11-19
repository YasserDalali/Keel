import { InvalidReportRequest } from "./errors";

export const TRANSACTION_TYPES = ["disbursement", "repayment", "deposit", "fee"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type Transaction = {
  id: string; loanId: string; installmentId: string | null; type: TransactionType; amount: number; method: string; status: string; createdAt: string;
};

export type TransactionFilter = { loanId?: string; type?: TransactionType; from?: string; to?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// D1 timestamps are "YYYY-MM-DD HH:MM:SS"; ISO strings sort the same once the separator matches.
const sortKey = (s: string) => s.replace("T", " ");

export function parseTransactionFilter(q: { loanId?: string; type?: string; from?: string; to?: string }): TransactionFilter {
  if (q.type && !TRANSACTION_TYPES.includes(q.type as TransactionType)) throw new InvalidReportRequest(`type must be one of ${TRANSACTION_TYPES.join(", ")}`);
  if ((q.from && !DATE.test(q.from)) || (q.to && !DATE.test(q.to))) throw new InvalidReportRequest("from and to must be dates like 2026-01-31");
  return { loanId: q.loanId, type: q.type as TransactionType | undefined, from: q.from, to: q.to };
}

/** Newest first, within the filter. Dates are compared by calendar day. */
export function selectTransactions(all: readonly Transaction[], f: TransactionFilter): Transaction[] {
  return all
    .filter((t) => (!f.loanId || t.loanId === f.loanId) && (!f.type || t.type === f.type))
    .filter((t) => (!f.from || t.createdAt.slice(0, 10) >= f.from) && (!f.to || t.createdAt.slice(0, 10) <= f.to))
    .sort((a, b) => sortKey(b.createdAt).localeCompare(sortKey(a.createdAt)));
}
