import type { Doc } from "../lib/loans";

// ponytail: title/loanId/amount come from the extended GET /api/documents; optional so an older API still lists files.
export type StatementDoc = Doc & { title?: string; loanId?: string | null; amount?: number | null };

export type Kind = "all" | "agreements" | "receipts" | "statements";
export const KIND_OF: Record<string, Exclude<Kind, "all">> = {
  loan_agreement: "agreements",
  account_opened: "agreements",
  payment_receipt: "receipts",
  deposit_receipt: "receipts",
  statement: "statements",
};
export const FALLBACK_TITLE: Record<string, string> = {
  loan_agreement: "Loan agreement",
  account_opened: "Account opened",
  payment_receipt: "Payment receipt",
  deposit_receipt: "Deposit receipt",
  statement: "Statement",
};
export const titleOf = (d: StatementDoc) => d.title || FALLBACK_TITLE[d.documentType] || "Document";

// D1 timestamps are "YYYY-MM-DD HH:MM:SS" UTC; group by that calendar date as stored.
export const ymd = (s: string) => s.slice(0, 10);

/** Filter by kind and loan, newest first, grouped year → month ("2026" → "2026-11"). */
export function groupDocs(docs: StatementDoc[], kind: Kind = "all", loanId = "") {
  const kept = docs
    .filter((d) => kind === "all" || KIND_OF[d.documentType] === kind)
    .filter((d) => !loanId || d.loanId === loanId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const years: { year: string; months: { month: string; docs: StatementDoc[] }[] }[] = [];
  for (const d of kept) {
    const year = ymd(d.createdAt).slice(0, 4);
    const month = ymd(d.createdAt).slice(0, 7);
    let y = years.at(-1);
    if (y?.year !== year) years.push((y = { year, months: [] }));
    let m = y.months.at(-1);
    if (m?.month !== month) y.months.push((m = { month, docs: [] }));
    m.docs.push(d);
  }
  return years;
}
