import { describe, expect, it } from "vitest";
import { monthlySeries, onTimeRate, onTimeStreak, summarise } from "../src/contexts/reporting/domain/history";
import { parseReminderSettings, remindersFor } from "../src/contexts/reporting/domain/reminders";
import { scheduleItem, type ScheduleItem, type ScheduleRow } from "../src/contexts/reporting/domain/schedule";
import { parseTransactionFilter, selectTransactions, type Transaction } from "../src/contexts/reporting/domain/transactions";

const TODAY = "2026-06-15";
const row = (o: Partial<ScheduleRow>): ScheduleRow => ({
  id: "i", loanId: "L", loanAmount: 1000, number: 1, count: 3, dueDate: "2026-06-20", amountDue: 350, amountPaid: 0, status: "unpaid", paidAt: null, ...o,
});
const item = (o: Partial<ScheduleRow>): ScheduleItem => scheduleItem(row(o), TODAY);

describe("scheduleItem", () => {
  it("derives overdue from the date, before the daily job stores it", () => {
    expect(item({ dueDate: "2026-06-14" }).status).toBe("overdue");
    expect(item({ dueDate: "2026-06-15" }).status).toBe("unpaid");
    expect(item({ dueDate: "2026-06-01", status: "paid", amountPaid: 350, paidAt: "2026-06-01 09:00:00" }).status).toBe("paid");
  });
  it("is on time when settled by its due date, late after, and null while unpaid", () => {
    expect(item({ dueDate: "2026-05-10", status: "paid", paidAt: "2026-05-10 23:59:59" }).onTime).toBe(true);
    expect(item({ dueDate: "2026-05-10", status: "paid", paidAt: "2026-05-11 00:00:01" }).onTime).toBe(false);
    expect(item({}).onTime).toBeNull();
  });
});

describe("on-time rate and streak", () => {
  const onTime = (n: number, paid: string) => item({ id: `p${n}`, number: n, dueDate: "2026-05-10", status: "paid", amountPaid: 350, paidAt: paid });
  const late = (n: number) => item({ id: `l${n}`, number: n, dueDate: "2026-05-01", status: "paid", amountPaid: 350, paidAt: "2026-05-09 10:00:00" });

  it("is null before anything is due, and counts an unpaid overdue installment as missed", () => {
    expect(onTimeRate([item({})])).toBeNull();
    expect(onTimeRate([item({ dueDate: "2026-06-01" })])).toBe(0);
    expect(onTimeRate([onTime(1, "2026-05-09 10:00:00"), item({ dueDate: "2026-06-01" })])).toBe(0.5);
  });
  it("is the share of paid installments that were on time", () => {
    expect(onTimeRate([onTime(1, "2026-05-09 10:00:00"), late(2), onTime(3, "2026-05-10 08:00:00")])).toBeCloseTo(2 / 3);
  });
  it("streaks over the most recent on-time payments and stops at the first late one", () => {
    expect(onTimeStreak([late(1), onTime(2, "2026-05-09 12:00:00"), onTime(3, "2026-05-10 01:00:00")])).toBe(2);
    expect(onTimeStreak([onTime(1, "2026-05-09 12:00:00"), late(2)])).toBe(1); // the late one was paid earlier, so it's behind the streak
    const latestIsLate = item({ id: "z", dueDate: "2026-05-10", status: "paid", amountPaid: 350, paidAt: "2026-05-12 10:00:00" });
    expect(onTimeStreak([onTime(1, "2026-05-09 12:00:00"), latestIsLate])).toBe(0); // the most recent payment was late
  });
  it("is zero while anything is overdue", () => {
    expect(onTimeStreak([onTime(1, "2026-05-09 12:00:00"), item({ dueDate: "2026-06-01" })])).toBe(0);
  });
});

describe("reminders", () => {
  const settings = { enabled: true, daysBefore: 3 };
  it("lists late, due-today and due-soon installments, nothing further out and nothing paid", () => {
    const items = [
      item({ id: "a", dueDate: "2026-06-12" }), // 3 days late
      item({ id: "b", dueDate: "2026-06-15" }), // today
      item({ id: "c", dueDate: "2026-06-18" }), // in 3 days: inside the window
      item({ id: "d", dueDate: "2026-06-19" }), // in 4 days: outside
      item({ id: "e", dueDate: "2026-06-10", status: "paid", amountPaid: 350, paidAt: "2026-06-10 10:00:00" }),
    ];
    expect(remindersFor(items, TODAY, settings).map((r) => [r.installmentId, r.kind, r.daysUntil])).toEqual([
      ["a", "overdue", -3], ["b", "due_today", 0], ["c", "due_soon", 3],
    ]);
  });
  it("reports what is left on a part-paid installment, and nothing when switched off", () => {
    const part = item({ dueDate: "2026-06-16", amountPaid: 100, status: "partial" });
    expect(remindersFor([part], TODAY, settings)[0].amount).toBe(250);
    expect(remindersFor([part], TODAY, { enabled: false, daysBefore: 3 })).toEqual([]);
  });
  it("accepts on/off with 1 to 14 whole days and refuses anything else", () => {
    expect(parseReminderSettings({ enabled: false, daysBefore: 14 })).toEqual({ enabled: false, daysBefore: 14 });
    for (const bad of [{ enabled: "yes", daysBefore: 3 }, { enabled: true, daysBefore: 0 }, { enabled: true, daysBefore: 15 }, { enabled: true, daysBefore: 2.5 }, { enabled: true }]) {
      expect(() => parseReminderSettings(bad)).toThrow(/whole number 1-14/);
    }
  });
});

describe("monthlySeries", () => {
  const loan = (createdAt: string) => ({ id: "L", amount: 1000, termMonths: 3, status: "active", createdAt, updatedAt: createdAt, approvedAt: createdAt, cancelledAt: null });
  it("has no points without loans", () => expect(monthlySeries([], [], [])).toEqual([]));
  it("runs from the first loan month to the last month with anything due or repaid, filling gaps", () => {
    const items = [item({ dueDate: "2026-02-10", amountDue: 350 }), item({ dueDate: "2026-04-10", amountDue: 350.5 })];
    const repaid = [{ amount: 350, createdAt: "2026-02-09 10:00:00" }, { amount: 100, createdAt: "2026-05-02 10:00:00" }];
    expect(monthlySeries([loan("2025-12-20 10:00:00")], items, repaid)).toEqual([
      { month: "2025-12", due: 0, repaid: 0 }, { month: "2026-01", due: 0, repaid: 0 },
      { month: "2026-02", due: 350, repaid: 350 }, { month: "2026-03", due: 0, repaid: 0 },
      { month: "2026-04", due: 350.5, repaid: 0 }, { month: "2026-05", due: 0, repaid: 100 },
    ]);
  });
  it("rolls over a year end", () => {
    const pts = monthlySeries([loan("2025-11-02 10:00:00")], [item({ dueDate: "2026-01-10" })], []);
    expect(pts.map((p) => p.month)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("summarise", () => {
  it("counts borrowed on approved loans only and what is still owed", () => {
    const approved = { id: "A", amount: 1000, termMonths: 3, status: "active", createdAt: "2026-01-01 00:00:00", updatedAt: "", approvedAt: "2026-01-02 00:00:00", cancelledAt: null };
    const pending = { ...approved, id: "B", amount: 500, status: "pending", approvedAt: null };
    const s = summarise([approved, pending], [item({ amountDue: 350, amountPaid: 100, status: "partial" })], "2026-01-01 00:00:00");
    expect(s).toMatchObject({ borrowed: 1000, repaid: 100, outstanding: 250, loansActive: 1, paymentsMade: 0, memberSince: "2026-01-01 00:00:00" });
  });
});

describe("transactions", () => {
  const t = (id: string, o: Partial<Transaction>): Transaction => ({ id, loanId: "L1", installmentId: null, type: "repayment", amount: 1, method: "paypal", status: "completed", createdAt: "2026-03-10 10:00:00", ...o });
  const all = [t("a", { createdAt: "2026-03-10 10:00:00" }), t("b", { type: "deposit", createdAt: "2026-03-12T08:00:00.000Z" }), t("c", { loanId: "L2", createdAt: "2026-03-01 09:00:00" })];

  it("sorts newest first even when stamps mix D1 and ISO formats", () => {
    expect(selectTransactions(all, {}).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
  it("filters by loan, type and inclusive calendar days", () => {
    expect(selectTransactions(all, { loanId: "L2" }).map((x) => x.id)).toEqual(["c"]);
    expect(selectTransactions(all, { type: "deposit" }).map((x) => x.id)).toEqual(["b"]);
    expect(selectTransactions(all, { from: "2026-03-10", to: "2026-03-10" }).map((x) => x.id)).toEqual(["a"]);
  });
  it("rejects an unknown type or a malformed date", () => {
    expect(() => parseTransactionFilter({ type: "gift" })).toThrow(/type must be one of/);
    expect(() => parseTransactionFilter({ from: "03/10/2026" })).toThrow(/dates like/);
    expect(parseTransactionFilter({ type: "fee", from: "2026-01-01" })).toEqual({ loanId: undefined, type: "fee", from: "2026-01-01", to: undefined });
  });
});
