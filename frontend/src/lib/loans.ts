import type { components } from "./api-types";

// ponytail: openapi.json omits these fields/endpoints; typed by hand from api/src/routes. Regenerate types if the spec catches up.
export type Loan = components["schemas"]["Loan"] & {
  upfront_required?: number;
  upfront_amount?: number;
  upfront_paid?: number;
  cancelled_at?: string | null;
};
export type Installment = components["schemas"]["Installment"];
export type ProfileRecord = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  nationalIdNumber: string | null;
  kycStatus: string;
};
export type KycStatus = "pending" | "approved" | "declined" | "in_review" | "in_progress" | "abandoned" | "expired" | "resubmitted";
export type Profile = { profile: ProfileRecord | null; kycStatus: KycStatus | null; bankConnected: boolean; bankSafetyScore?: number | null };
export type Risk = { finalScore: number; bankSafety: number; behavior: number; weights: Record<string, number>; threshold: number };
export type Doc = { id: string; documentType: "loan_agreement" | "payment_receipt" | string; referenceId: string | null; createdAt: string };

export type Tone = "accent" | "warning" | "danger" | "muted";

/** Loan status in the borrower's words. The API stores officer rejections as `defaulted` with no `approved_at`. */
export function loanStatus(l: Pick<Loan, "status"> & { approved_at?: string | null; cancelled_at?: string | null }): { label: string; tone: Tone } {
  switch (l.status) {
    case "pending":
    case "under_review":
      return { label: "With a loan officer", tone: "warning" };
    case "approved":
    case "active":
      return { label: "Repaying", tone: "accent" };
    case "fully_paid":
      return { label: "Paid off", tone: "muted" };
    case "defaulted":
      if (l.cancelled_at) return { label: "Cancelled", tone: "muted" };
      return l.approved_at ? { label: "In default", tone: "danger" } : { label: "Not approved", tone: "muted" };
  }
}

export const KYC: Record<KycStatus, { label: string; tone: Tone; note: string }> = {
  pending: { label: "Not started", tone: "muted", note: "Takes about three minutes with your ID and phone camera." },
  in_progress: { label: "Checking", tone: "warning", note: "Your result usually arrives within a few minutes." },
  in_review: { label: "Under review", tone: "warning", note: "A person is looking at your documents. This usually takes a few minutes." },
  resubmitted: { label: "Under review", tone: "warning", note: "We received your new documents and are checking them." },
  approved: { label: "Verified", tone: "accent", note: "Your identity is confirmed." },
  declined: { label: "Not verified", tone: "danger", note: "We couldn't confirm your identity. You can try again with a clearer photo of your ID." },
  abandoned: { label: "Not finished", tone: "muted", note: "You left before finishing. Start again whenever you're ready." },
  expired: { label: "Expired", tone: "muted", note: "That session timed out. Start a new one." },
};
export const KYC_RESTARTABLE: (KycStatus | null)[] = [null, "pending", "expired", "abandoned", "declined"];

export const INSTALLMENT: Record<Installment["status"], { label: string; tone: Tone }> = {
  unpaid: { label: "Due", tone: "muted" },
  partial: { label: "Part paid", tone: "warning" },
  paid: { label: "Paid", tone: "accent" },
  overdue: { label: "Overdue", tone: "danger" },
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function progress(rows: Installment[]) {
  const paid = cents(rows.reduce((s, r) => s + r.amount_paid, 0));
  const total = cents(rows.reduce((s, r) => s + r.amount_due, 0));
  return { paid, total, fraction: total ? paid / total : 0 };
}

export function nextDue(rows: Installment[]) {
  const next = [...rows].sort((a, b) => a.installment_number - b.installment_number).find((r) => r.status !== "paid");
  return next ? { ...next, remaining: cents(next.amount_due - next.amount_paid) } : null;
}

export function readiness(p: Pick<Profile, "profile" | "kycStatus" | "bankConnected">) {
  return [
    { key: "profile", label: "Your details", done: !!p.profile },
    { key: "bank", label: "Connect your bank", done: p.bankConnected },
    { key: "identity", label: "Verify your ID", done: p.kycStatus === "approved" },
  ] as const;
}

export const date = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export type LoanWithSchedule = { loan: Loan; installments: Installment[] };
export type Step = { key: string; label: string; date?: string | null; state: "done" | "current" | "todo" };

/** Where a loan is in its life, for the stepper on the loan page. Cancelled/declined loans end early. */
export function lifecycle(loan: Loan, installments: Installment[]): Step[] {
  const applied = { key: "applied", label: "Applied", date: loan.created_at, done: true };
  if (loan.status === "defaulted" && loan.cancelled_at) return mark([applied, { key: "cancelled", label: "Cancelled", date: loan.cancelled_at, done: true }]);
  if (loan.status === "defaulted" && !loan.approved_at) return mark([applied, { key: "declined", label: "Not approved", date: loan.updated_at, done: true }]);

  const paidOff = loan.status === "fully_paid";
  const lastPaid = installments.filter((i) => i.paid_at).map((i) => i.paid_at!).sort().at(-1);
  return mark([
    applied,
    ...(loan.upfront_required ? [{ key: "deposit", label: loan.upfront_paid === 1 ? "Deposit paid" : "Deposit", done: loan.upfront_paid === 1 }] : []),
    { key: "approved", label: "Approved", date: loan.approved_at, done: !!loan.approved_at },
    { key: "repaying", label: loan.status === "defaulted" ? "In default" : "Repaying", done: paidOff },
    { key: "paid", label: "Paid off", date: paidOff ? lastPaid ?? loan.updated_at : null, done: paidOff },
  ]);
}

function mark(steps: { key: string; label: string; date?: string | null; done: boolean }[]): Step[] {
  const firstOpen = steps.findIndex((s) => !s.done);
  return steps.map(({ done, ...s }, i) => ({ ...s, state: done ? "done" : i === firstOpen ? "current" : "todo" }));
}

/** Next unpaid payments across every loan, soonest first. */
export function upcoming(loans: LoanWithSchedule[], n = 3) {
  return loans
    .flatMap(({ loan, installments }) => installments.filter((i) => i.status !== "paid").map((installment) => ({ loan, installment })))
    .sort((a, b) => a.installment.due_date.localeCompare(b.installment.due_date))
    .slice(0, n);
}

export function totals(loans: LoanWithSchedule[]) {
  const funded = loans.filter(({ loan }) => ["active", "approved", "fully_paid"].includes(loan.status) || (loan.status === "defaulted" && loan.approved_at));
  const rows = funded.flatMap((l) => l.installments);
  return {
    borrowed: cents(funded.reduce((s, { loan }) => s + loan.amount, 0)),
    owed: cents(rows.reduce((s, r) => s + Math.max(0, r.amount_due - r.amount_paid), 0)),
    repaid: cents(rows.reduce((s, r) => s + r.amount_paid, 0)),
    paymentsLeft: rows.filter((r) => r.status !== "paid").length,
  };
}

export type Event = { kind: "applied" | "approved" | "paid" | "paid_off" | "cancelled" | "declined"; date: string; text: string; loanId: string };

/** What happened, newest first. Built from loan and installment timestamps; nothing extra is stored. */
export function activity(loans: LoanWithSchedule[]): Event[] {
  const out: Event[] = [];
  for (const { loan, installments } of loans) {
    const ref = shortId(loan.id);
    out.push({ kind: "applied", date: loan.created_at, text: `Applied for ${usdWhole(loan.amount)} · ${ref}`, loanId: loan.id });
    if (loan.approved_at) out.push({ kind: "approved", date: loan.approved_at, text: `Approved · ${ref}`, loanId: loan.id });
    if (loan.cancelled_at) out.push({ kind: "cancelled", date: loan.cancelled_at, text: `Cancelled · ${ref}`, loanId: loan.id });
    else if (loan.status === "defaulted" && !loan.approved_at) out.push({ kind: "declined", date: loan.updated_at, text: `Not approved · ${ref}`, loanId: loan.id });
    for (const i of installments)
      if (i.paid_at) out.push({ kind: "paid", date: i.paid_at, text: `Payment ${i.installment_number} of ${installments.length} paid · ${usdWhole(i.amount_paid)}`, loanId: loan.id });
    if (loan.status === "fully_paid") out.push({ kind: "paid_off", date: loan.updated_at, text: `Paid off · ${ref}`, loanId: loan.id });
  }
  // Timestamps have one-second precision; on a tie the later step in a loan's life comes first.
  const rank: Record<Event["kind"], number> = { applied: 0, approved: 1, declined: 2, cancelled: 2, paid: 3, paid_off: 4 };
  return out.sort((a, b) => toTime(b.date) - toTime(a.date) || rank[b.kind] - rank[a.kind]);
}

// D1 timestamps come back as "YYYY-MM-DD HH:MM:SS" (UTC, no zone); make them parseable everywhere.
const toTime = (s: string) => new Date(s.includes("T") || s.length === 10 ? s : `${s.replace(" ", "T")}Z`).getTime();
const usdWhole = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
