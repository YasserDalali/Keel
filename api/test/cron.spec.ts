import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { D1LoanRepository } from "../src/contexts/lending/infrastructure/d1-loan-repository";
import { day, installment, loan, stamp, user } from "./phase4-helpers";

const status = (id: string) => env.DB.prepare("SELECT status FROM installments WHERE id = ?").bind(id).first<{ status: string }>().then((r) => r?.status);

describe("overdue cron", () => {
  it("marks unpaid and partial installments past due as overdue, leaving the rest", async () => {
    const u = await user();
    const l = await loan(u.id);
    const late = await installment(l, 1, { due: day(-1) });
    const partial = await installment(l, 2, { due: day(-5), amountPaid: 10, status: "partial" });
    const paid = await installment(l, 3, { due: day(-9), amountPaid: 350, status: "paid", paidAt: stamp(-10) });
    const today = await installment(l, 4, { due: day(0) });
    await new D1LoanRepository(env.DB).markOverdue(day(0));
    expect([await status(late), await status(partial), await status(paid), await status(today)]).toEqual(["overdue", "overdue", "paid", "unpaid"]);
  });

  it("is wired as the worker's scheduled handler, and the app still serves requests", async () => {
    expect(typeof (worker as unknown as { scheduled?: unknown }).scheduled).toBe("function");
    expect((await worker.request("/api/health", {}, env)).status).toBe(200);
  });
});
