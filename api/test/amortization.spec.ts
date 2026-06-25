import { describe, expect, it } from "vitest";
import { generateInstallments } from "../src/loans/amortization";

describe("generateInstallments", () => {
  it("produces one installment per term month", () => {
    const schedule = generateInstallments(1200, 0.05, 6, new Date("2026-01-01"));
    expect(schedule).toHaveLength(6);
    expect(schedule.map((i) => i.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("sums installments to exactly principal plus flat interest", () => {
    const schedule = generateInstallments(1200, 0.05, 6, new Date("2026-01-01"));
    const total = schedule.reduce((sum, i) => sum + i.amountDue, 0);
    expect(Math.round(total * 100) / 100).toBe(1260);
  });

  it("sets due dates on consecutive months after the start date", () => {
    const schedule = generateInstallments(1200, 0.05, 3, new Date("2026-01-15"));
    expect(schedule.map((i) => i.dueDate)).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });
});
