import { describe, expect, it } from "vitest";
import { day, get, installment, loan, stamp, txn, user } from "./phase4-helpers";

type History = {
  summary: { borrowed: number; repaid: number; outstanding: number; loansActive: number; loansCompleted: number; paymentsMade: number; onTimeRate: number | null; onTimeStreak: number; memberSince: string };
  monthly: { month: string; due: number; repaid: number }[];
  milestones: { date: string; kind: string; text: string; loanId: string | null }[];
};
const history = async (h: Record<string, string>, q = "") => (await get(`/api/history${q}`, h)).json<History>();

describe("GET /api/history", () => {
  it("summarises borrowing, repayment and on-time behaviour", async () => {
    const u = await user("borrower", "2026-01-05 09:00:00");
    const done = await loan(u.id, { amount: 600, status: "fully_paid", createdAt: "2026-01-10 10:00:00", approvedAt: "2026-01-11 10:00:00" });
    await installment(done, 1, { due: "2026-02-11", amountDue: 315, amountPaid: 315, status: "paid", paidAt: "2026-02-15 10:00:00" }); // late
    await installment(done, 2, { due: "2026-03-11", amountDue: 315, amountPaid: 315, status: "paid", paidAt: "2026-03-10 10:00:00" });
    const active = await loan(u.id, { amount: 1000, status: "active", createdAt: "2026-04-01 10:00:00", approvedAt: "2026-04-02 10:00:00" });
    await installment(active, 1, { due: "2026-05-02", amountDue: 350, amountPaid: 350, status: "paid", paidAt: "2026-05-01 10:00:00" });
    await installment(active, 2, { due: day(30), amountDue: 350 });
    await installment(active, 3, { due: day(60), amountDue: 350 });
    await loan(u.id, { amount: 900, status: "defaulted", approvedAt: null, cancelledAt: "2026-06-02 10:00:00", createdAt: "2026-06-01 10:00:00" });

    const { summary } = await history(u.headers);
    expect(summary).toEqual({
      borrowed: 1600,
      repaid: 980,
      outstanding: 700,
      loansActive: 1,
      loansCompleted: 1,
      paymentsMade: 3,
      onTimeRate: 2 / 3,
      onTimeStreak: 2,
      memberSince: "2026-01-05 09:00:00",
    });
  });

  it("breaks the streak and counts an unpaid overdue payment as missed", async () => {
    const u = await user();
    const l = await loan(u.id);
    await installment(l, 1, { due: day(-2) });
    const { summary } = await history(u.headers);
    expect(summary.onTimeStreak).toBe(0);
    expect(summary.onTimeRate).toBe(0);
  });

  it("reports a null on-time rate before anything is due", async () => {
    const u = await user();
    const l = await loan(u.id);
    await installment(l, 1, { due: day(10) });
    expect((await history(u.headers)).summary.onTimeRate).toBeNull();
  });

  it("builds a monthly series from the first loan month to the last scheduled month", async () => {
    const u = await user();
    const l = await loan(u.id, { createdAt: "2026-01-20 10:00:00", approvedAt: "2026-01-21 10:00:00" });
    const i1 = await installment(l, 1, { due: "2026-02-21", amountDue: 350, amountPaid: 350, status: "paid", paidAt: "2026-02-20 10:00:00" });
    await installment(l, 2, { due: "2026-04-21", amountDue: 350 });
    await txn(l, { type: "repayment", amount: 350, installmentId: i1, createdAt: "2026-02-20 10:00:00" });
    const { monthly } = await history(u.headers);
    expect(monthly).toEqual([
      { month: "2026-01", due: 0, repaid: 0 },
      { month: "2026-02", due: 350, repaid: 350 },
      { month: "2026-03", due: 0, repaid: 0 },
      { month: "2026-04", due: 350, repaid: 0 },
    ]);
  });

  it("lists milestones newest first", async () => {
    const u = await user("borrower", "2026-01-01 08:00:00");
    const l = await loan(u.id, { amount: 600, status: "fully_paid", createdAt: "2026-01-10 10:00:00", approvedAt: "2026-01-11 10:00:00" });
    await installment(l, 1, { due: "2026-02-11", amountDue: 630, amountPaid: 630, status: "paid", paidAt: "2026-02-10 10:00:00" });
    const { milestones } = await history(u.headers);
    expect(milestones.map((m) => m.kind)).toEqual(["paid_off", "first_payment", "approved", "applied", "joined"]);
    expect(milestones.at(-1)).toMatchObject({ loanId: null, date: "2026-01-01 08:00:00" });
    expect(milestones.every((m) => typeof m.text === "string" && m.text.length > 0)).toBe(true);
  });

  it("is empty but well-formed for a new borrower, and private to them", async () => {
    const u = await user();
    const other = await user();
    await loan(other.id, { amount: 5000 });
    const h = await history(u.headers, `?userId=${other.id}`);
    expect(h.summary.borrowed).toBe(0);
    expect(h.monthly).toEqual([]);
    expect(h.milestones.map((m) => m.kind)).toEqual(["joined"]);
  });

  it("requires sign-in", async () => {
    expect((await get("/api/history", {})).status).toBe(401);
  });
});

void stamp;
