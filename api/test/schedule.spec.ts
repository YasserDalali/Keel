import { describe, expect, it } from "vitest";
import { day, get, installment, loan, stamp, user } from "./phase4-helpers";

type Item = { id: string; loanId: string; loanAmount: number; number: number; count: number; dueDate: string; amountDue: number; amountPaid: number; status: string; paidAt: string | null; onTime: boolean | null };
const schedule = async (h: Record<string, string>, q = "") => (await (await get(`/api/schedule${q}`, h)).json<{ installments: Item[] }>()).installments;

describe("GET /api/schedule", () => {
  it("requires sign-in", async () => {
    expect((await get("/api/schedule", {})).status).toBe(401);
  });

  it("lists the borrower's installments across loans, by due date, with loan context", async () => {
    const u = await user();
    const a = await loan(u.id, { amount: 1200 });
    const b = await loan(u.id, { amount: 600 });
    await installment(a, 2, { due: day(40) });
    await installment(a, 1, { due: day(10) });
    await installment(b, 1, { due: day(20) });
    const items = await schedule(u.headers);
    expect(items.map((i) => i.dueDate)).toEqual([day(10), day(20), day(40)]);
    expect(items[0]).toMatchObject({ loanId: a, loanAmount: 1200, number: 1, count: 2 });
    expect(items[1]).toMatchObject({ loanId: b, count: 1 });
  });

  it("derives overdue for unpaid or partial installments past due, and computes onTime", async () => {
    const u = await user();
    const l = await loan(u.id);
    await installment(l, 1, { due: day(-20), amountPaid: 350, status: "paid", paidAt: stamp(-21) });
    await installment(l, 2, { due: day(-10), amountPaid: 350, status: "paid", paidAt: stamp(-5) });
    await installment(l, 3, { due: day(-1), amountPaid: 100, status: "partial" });
    await installment(l, 4, { due: day(-1) });
    await installment(l, 5, { due: day(0) });
    const items = await schedule(u.headers);
    expect(items.map((i) => [i.number, i.status, i.onTime])).toEqual([
      [1, "paid", true],
      [2, "paid", false],
      [3, "overdue", null],
      [4, "overdue", null],
      [5, "unpaid", null],
    ]);
  });

  it("never shows another borrower's installments, even with ?userId", async () => {
    const owner = await user();
    const other = await user();
    await installment(await loan(owner.id), 1, { due: day(5) });
    expect(await schedule(other.headers, `?userId=${owner.id}`)).toEqual([]);
  });

  it("lets staff read a borrower's schedule with ?userId", async () => {
    const owner = await user();
    const officer = await user("officer");
    await installment(await loan(owner.id), 1, { due: day(5) });
    expect(await schedule(officer.headers, `?userId=${owner.id}`)).toHaveLength(1);
  });
});
