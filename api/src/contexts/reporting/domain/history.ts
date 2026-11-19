import { cents, type ScheduleItem } from "./schedule";

export type HistoryLoan = {
  id: string; amount: number; termMonths: number; status: string; createdAt: string; updatedAt: string; approvedAt: string | null; cancelledAt: string | null;
};
export type HistoryRepayment = { amount: number; createdAt: string };

export type MilestoneKind = "joined" | "applied" | "approved" | "first_payment" | "paid_off" | "cancelled" | "declined";
export type Milestone = { date: string; kind: MilestoneKind; text: string; loanId: string | null };
export type MonthPoint = { month: string; due: number; repaid: number };

const norm = (s: string) => s.replace("T", " ");
const month = (s: string) => s.slice(0, 7);
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
// Same-second events: the later step in a loan's life sorts first.
const RANK: Record<MilestoneKind, number> = { joined: 0, applied: 1, approved: 2, declined: 3, cancelled: 3, first_payment: 4, paid_off: 5 };

/** Share of due-or-late installments paid on time; an unpaid overdue one counts as missed. Null before anything is due. */
export function onTimeRate(items: readonly ScheduleItem[]): number | null {
  const rated = items.filter((i) => i.status === "paid" && i.onTime !== null);
  const overdue = items.filter((i) => i.status === "overdue").length;
  return rated.length + overdue ? rated.filter((i) => i.onTime).length / (rated.length + overdue) : null;
}

/** Consecutive on-time payments, most recent first. Any overdue installment breaks it (it is 0 while something is late). */
export function onTimeStreak(items: readonly ScheduleItem[]): number {
  if (items.some((i) => i.status === "overdue")) return 0;
  const recentFirst = items
    .filter((i) => i.status === "paid")
    .sort((a, b) => norm(b.paidAt ?? "").localeCompare(norm(a.paidAt ?? "")) || b.dueDate.localeCompare(a.dueDate));
  let streak = 0;
  for (const i of recentFirst) {
    if (!i.onTime) break;
    streak++;
  }
  return streak;
}

export function summarise(loans: readonly HistoryLoan[], items: readonly ScheduleItem[], memberSince: string | null) {
  return {
    borrowed: cents(loans.filter((l) => l.approvedAt).reduce((s, l) => s + l.amount, 0)),
    repaid: cents(items.reduce((s, i) => s + i.amountPaid, 0)),
    outstanding: cents(items.reduce((s, i) => s + Math.max(0, i.amountDue - i.amountPaid), 0)),
    loansActive: loans.filter((l) => l.status === "active").length,
    loansCompleted: loans.filter((l) => l.status === "fully_paid").length,
    paymentsMade: items.filter((i) => i.status === "paid").length,
    onTimeRate: onTimeRate(items),
    onTimeStreak: onTimeStreak(items),
    memberSince,
  };
}

/** First loan month through the last month anything is due or was repaid, one point per month. */
export function monthlySeries(loans: readonly HistoryLoan[], items: readonly ScheduleItem[], repayments: readonly HistoryRepayment[]): MonthPoint[] {
  if (!loans.length) return [];
  const due = new Map<string, number>();
  const repaid = new Map<string, number>();
  for (const i of items) due.set(month(i.dueDate), (due.get(month(i.dueDate)) ?? 0) + i.amountDue);
  for (const r of repayments) repaid.set(month(r.createdAt), (repaid.get(month(r.createdAt)) ?? 0) + r.amount);
  const first = month(loans[0].createdAt);
  const last = [first, ...due.keys(), ...repaid.keys()].sort().at(-1)!;
  const points: MonthPoint[] = [];
  for (let m = first; m <= last; m = nextMonth(m)) points.push({ month: m, due: cents(due.get(m) ?? 0), repaid: cents(repaid.get(m) ?? 0) });
  return points;
}

/** The borrower's story in order, newest first. */
export function milestones(joinedAt: string | null, loans: readonly HistoryLoan[], items: readonly ScheduleItem[]): Milestone[] {
  const out: Milestone[] = [];
  if (joinedAt) out.push({ date: joinedAt, kind: "joined", text: "Joined Keel", loanId: null });
  for (const l of loans) {
    const amt = usd(l.amount);
    out.push({ date: l.createdAt, kind: "applied", text: `Applied for ${amt}`, loanId: l.id });
    if (l.approvedAt) out.push({ date: l.approvedAt, kind: "approved", text: `Approved: ${amt} over ${l.termMonths} months`, loanId: l.id });
    if (l.cancelledAt) out.push({ date: l.cancelledAt, kind: "cancelled", text: `Cancelled the ${amt} application`, loanId: l.id });
    else if (l.status === "defaulted" && !l.approvedAt) out.push({ date: l.updatedAt, kind: "declined", text: `${amt} application not approved`, loanId: l.id });
    const paidDates = items.filter((i) => i.loanId === l.id && i.paidAt).map((i) => norm(i.paidAt!)).sort();
    if (paidDates.length) out.push({ date: paidDates[0], kind: "first_payment", text: `First payment on the ${amt} loan`, loanId: l.id });
    if (l.status === "fully_paid") out.push({ date: paidDates.at(-1) ?? l.updatedAt, kind: "paid_off", text: `Paid off the ${amt} loan`, loanId: l.id });
  }
  return out.sort((a, b) => norm(b.date).localeCompare(norm(a.date)) || RANK[b.kind] - RANK[a.kind]);
}
