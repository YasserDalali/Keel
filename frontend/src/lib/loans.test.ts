import { describe, expect, it } from "vitest";
import { activity, lifecycle, loanStatus, nextDue, progress, readiness, totals, upcoming, type Installment, type Loan } from "./loans";

const inst = (n: number, due: number, paid: number, status: Installment["status"]): Installment => ({
  id: `i${n}`, loan_id: "l", installment_number: n, due_date: `2026-0${n}-01`, amount_due: due, amount_paid: paid, status,
});

describe("loanStatus", () => {
  it("reads a defaulted loan that was never approved as declined", () => {
    expect(loanStatus({ status: "defaulted", approved_at: null }).label).toBe("Not approved");
    expect(loanStatus({ status: "defaulted", approved_at: "2026-01-01" }).label).toBe("In default");
  });
  it("names the review step in plain words", () => {
    expect(loanStatus({ status: "pending" }).label).toBe("With a loan officer");
  });
});

describe("progress and nextDue", () => {
  const rows = [inst(2, 350, 0, "unpaid"), inst(1, 350, 350, "paid"), inst(3, 350, 100, "partial")];
  it("sums repaid against the total due", () => {
    expect(progress(rows)).toEqual({ paid: 450, total: 1050, fraction: 450 / 1050 });
  });
  it("picks the lowest-numbered unsettled installment and what is left on it", () => {
    expect(nextDue(rows)).toMatchObject({ id: "i2", remaining: 350 });
    expect(nextDue([inst(1, 350, 350, "paid")])).toBeNull();
  });
  it("handles an empty schedule", () => {
    expect(progress([])).toEqual({ paid: 0, total: 0, fraction: 0 });
  });
});

describe("readiness", () => {
  it("lists what is still missing before applying", () => {
    const r = readiness({ profile: null, kycStatus: null, bankConnected: true });
    expect(r.map((s) => [s.key, s.done])).toEqual([["profile", false], ["bank", true], ["identity", false]]);
  });
  it("only counts approved identity as done", () => {
    const r = readiness({ profile: {} as never, kycStatus: "in_review", bankConnected: false });
    expect(r[2].done).toBe(false);
  });
});

describe("cancelled loans", () => {
  it("read as cancelled, not declined", () => {
    expect(loanStatus({ status: "defaulted", approved_at: null, cancelled_at: "2026-11-01" }).label).toBe("Cancelled");
  });
});

const loan = (o: Partial<Loan> = {}): Loan => ({
  id: "L1", borrower_id: "b", amount: 1000, interest_rate: 0.05, term_months: 3, status: "pending",
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", ...o,
});

describe("lifecycle", () => {
  it("adds a deposit step only when one is required", () => {
    expect(lifecycle(loan(), []).map((s) => s.key)).toEqual(["applied", "approved", "repaying", "paid"]);
    expect(lifecycle(loan({ upfront_required: 1 }), []).map((s) => s.key)).toEqual(["applied", "deposit", "approved", "repaying", "paid"]);
  });
  it("marks where a repaying loan is", () => {
    const steps = lifecycle(loan({ status: "active", approved_at: "2026-10-02" }), [inst(1, 350, 350, "paid"), inst(2, 350, 0, "unpaid")]);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
  });
  it("ends at cancelled", () => {
    const steps = lifecycle(loan({ status: "defaulted", cancelled_at: "2026-10-03" }), []);
    expect(steps.at(-1)).toMatchObject({ key: "cancelled", state: "done" });
    expect(steps).toHaveLength(2);
  });
});

describe("upcoming and totals", () => {
  const a = { loan: loan({ id: "A", status: "active", amount: 1000 }), installments: [inst(1, 350, 350, "paid"), inst(2, 350, 0, "unpaid"), inst(3, 350, 0, "unpaid")] };
  it("lists the next unpaid payments across loans by due date", () => {
    expect(upcoming([a], 1).map((u) => u.installment.id)).toEqual(["i2"]);
  });
  it("totals borrowed, owed, repaid and payments left", () => {
    expect(totals([a])).toEqual({ borrowed: 1000, owed: 700, repaid: 350, paymentsLeft: 2 });
  });
});

describe("activity", () => {
  it("lists events newest first", () => {
    const l = loan({ status: "active", approved_at: "2026-10-05T00:00:00Z" });
    const ev = activity([{ loan: l, installments: [{ ...inst(1, 350, 350, "paid"), paid_at: "2026-11-01T00:00:00Z" }] }]);
    expect(ev.map((e) => e.kind)).toEqual(["paid", "approved", "applied"]);
  });
});

describe("activity ties", () => {
  it("puts the later step first when timestamps match", () => {
    const t = "2026-11-17 10:00:00";
    const l = loan({ status: "active", created_at: t, approved_at: t });
    const ev = activity([{ loan: l, installments: [{ ...inst(1, 350, 350, "paid"), paid_at: t }] }]);
    expect(ev.map((e) => e.kind)).toEqual(["paid", "approved", "applied"]);
  });
});
