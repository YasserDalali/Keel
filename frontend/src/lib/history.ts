// Phase 4 contract types (tasks/todo.md) and the pure logic behind Schedule, History and Reminders.

export type ScheduleStatus = "paid" | "partial" | "unpaid" | "overdue";
export type ScheduleItem = {
  id: string;
  loanId: string;
  loanAmount: number;
  number: number;
  count: number;
  dueDate: string; // YYYY-MM-DD
  amountDue: number;
  amountPaid: number;
  status: ScheduleStatus;
  paidAt: string | null;
  onTime: boolean | null;
};

export type TxnType = "disbursement" | "repayment" | "deposit" | "fee";
export type Txn = {
  id: string;
  loanId: string;
  installmentId: string | null;
  type: TxnType;
  amount: number;
  method: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
};

export type ReminderKind = "overdue" | "due_today" | "due_soon";
export type Reminder = { installmentId: string; loanId: string; number: number; dueDate: string; amount: number; kind: ReminderKind; daysUntil: number };
export type ReminderSettings = { enabled: boolean; daysBefore: number };

export type HistorySummary = {
  borrowed: number;
  repaid: number;
  outstanding: number;
  loansActive: number;
  loansCompleted: number;
  paymentsMade: number;
  onTimeRate: number | null;
  onTimeStreak: number;
  memberSince: string;
};
export type MonthPoint = { month: string; due: number; repaid: number };
export type Milestone = {
  date: string;
  kind: "joined" | "applied" | "approved" | "first_payment" | "paid_off" | "cancelled" | "declined";
  text: string;
  loanId: string | null;
};
export type History = { summary: HistorySummary; monthly: MonthPoint[]; milestones: Milestone[] };

const cents = (n: number) => Math.round(n * 100) / 100;

/** D1 returns "YYYY-MM-DD HH:MM:SS" (UTC, no zone); dates alone are local calendar days. */
export function parseTs(s: string): Date {
  if (s.length === 10) return new Date(`${s}T00:00:00`);
  return new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
}

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const monthKey = (d: Date) => ymd(d).slice(0, 7);

export function monthLabel(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: style, year: "numeric" });
}

export function shiftMonth(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}

/** Calendar cells for a month, weeks starting Monday, padded with the neighbouring months' days. */
export function monthGrid(key: string): { date: string; inMonth: boolean }[][] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(y, m, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(y, m - 1, 1 - lead + i);
    if (i % 7 === 0) weeks.push([]);
    weeks.at(-1)!.push({ date: ymd(d), inMonth: d.getMonth() === m - 1 });
  }
  return weeks;
}

export type MonthGroup = { month: string; items: ScheduleItem[]; due: number; paid: number; left: number };

/** Installments grouped by due month, with totals per month. Input order within a month is kept by due date. */
export function groupByMonth(items: ScheduleItem[]): MonthGroup[] {
  const map = new Map<string, ScheduleItem[]>();
  for (const it of [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number)) {
    const k = it.dueDate.slice(0, 7);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map].map(([month, rows]) => {
    const due = cents(rows.reduce((s, r) => s + r.amountDue, 0));
    const paid = cents(rows.reduce((s, r) => s + r.amountPaid, 0));
    return { month, items: rows, due, paid, left: cents(due - paid) };
  });
}

/** The soonest installment that isn't fully paid. */
export const nextUnpaid = (items: ScheduleItem[]) =>
  [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).find((i) => i.status !== "paid") ?? null;

export type CellTone = "paid" | "partial" | "due" | "overdue" | "next";
export const toneOf = (it: ScheduleItem, nextId?: string): CellTone =>
  it.status === "paid" ? "paid" : it.status === "overdue" ? "overdue" : it.id === nextId ? "next" : it.status === "partial" ? "partial" : "due";

// ---- iCalendar -----------------------------------------------------------

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDate = (key: string) => key.replace(/-/g, "");
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

/** An .ics calendar of every unpaid installment, as all-day events with a reminder the day before. */
export function toIcs(items: ScheduleItem[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = items
    .filter((i) => i.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .flatMap((i) => {
      const [y, m, d] = i.dueDate.split("-").map(Number);
      const end = ymd(new Date(y, m - 1, d + 1));
      const left = cents(i.amountDue - i.amountPaid);
      return [
        "BEGIN:VEVENT",
        `UID:${i.id}@keel`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(i.dueDate)}`,
        `DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:${icsText(`Keel payment ${i.number} of ${i.count}: ${money(left)}`)}`,
        `DESCRIPTION:${icsText(`Loan ${i.loanId.slice(0, 8).toUpperCase()} (${money(i.loanAmount)}). Pay in your Keel account.`)}`,
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsText(`Keel payment of ${money(left)} due tomorrow`)}`,
        "END:VALARM",
        "END:VEVENT",
      ];
    });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Keel//Repayments//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

// ---- Transactions ---------------------------------------------------------

export type TxnFilter = { type?: TxnType | ""; loanId?: string; from?: string; to?: string; q?: string };

export const TXN_LABEL: Record<TxnType, string> = { disbursement: "Money sent to you", repayment: "Repayment", deposit: "Deposit", fee: "Fee" };

/** Filters by type, loan, inclusive date range (YYYY-MM-DD) and free text over label, method, amount and loan id. */
export function filterTxns(txns: Txn[], f: TxnFilter): Txn[] {
  const q = f.q?.trim().toLowerCase();
  return txns.filter((t) => {
    const day = ymd(parseTs(t.createdAt));
    if (f.type && t.type !== f.type) return false;
    if (f.loanId && t.loanId !== f.loanId) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (q && ![TXN_LABEL[t.type], t.method, String(t.amount), t.loanId, t.status].some((v) => v.toLowerCase().includes(q))) return false;
    return true;
  });
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV of transactions. Money in plain decimals so spreadsheets read it as numbers. */
export function toCsv(txns: Txn[]): string {
  const head = ["Date", "Type", "Amount (USD)", "Method", "Status", "Loan", "Installment", "Reference"];
  const rows = txns.map((t) => [ymd(parseTs(t.createdAt)), TXN_LABEL[t.type], t.amount.toFixed(2), t.method, t.status, t.loanId, t.installmentId, t.id]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Save text as a file through a temporary link. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Repaid share per loan from the schedule, for the borrowing-progress list. */
export function progressByLoan(items: ScheduleItem[]) {
  const map = new Map<string, { loanId: string; loanAmount: number; due: number; paid: number; count: number; made: number; lastDue: string }>();
  for (const i of items) {
    const p = map.get(i.loanId) ?? { loanId: i.loanId, loanAmount: i.loanAmount, due: 0, paid: 0, count: i.count, made: 0, lastDue: i.dueDate };
    p.due = cents(p.due + i.amountDue);
    p.paid = cents(p.paid + i.amountPaid);
    if (i.status === "paid") p.made++;
    if (i.dueDate > p.lastDue) p.lastDue = i.dueDate;
    map.set(i.loanId, p);
  }
  return [...map.values()].map((p) => ({ ...p, fraction: p.due ? p.paid / p.due : 0 }));
}
