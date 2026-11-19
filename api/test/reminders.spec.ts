import { describe, expect, it } from "vitest";
import { day, get, installment, loan, put, stamp, user } from "./phase4-helpers";

type Reminder = { installmentId: string; loanId: string; number: number; dueDate: string; amount: number; kind: string; daysUntil: number };
type Settings = { enabled: boolean; daysBefore: number };
const reminders = async (h: Record<string, string>) => (await get("/api/reminders", h)).json<{ reminders: Reminder[]; settings: Settings }>();

async function borrowerWithSchedule() {
  const u = await user();
  const l = await loan(u.id);
  await installment(l, 1, { due: day(-3), amountPaid: 100, status: "partial" });
  await installment(l, 2, { due: day(0) });
  await installment(l, 3, { due: day(2) });
  await installment(l, 4, { due: day(10) });
  await installment(l, 5, { due: day(-30), amountPaid: 350, status: "paid", paidAt: stamp(-31) });
  return { u, l };
}

describe("GET /api/reminders", () => {
  it("returns default settings and overdue, due-today and due-soon payments", async () => {
    const { u } = await borrowerWithSchedule();
    const body = await reminders(u.headers);
    expect(body.settings).toEqual({ enabled: true, daysBefore: 3 });
    expect(body.reminders.map((r) => [r.number, r.kind, r.daysUntil, r.amount])).toEqual([
      [1, "overdue", -3, 250],
      [2, "due_today", 0, 350],
      [3, "due_soon", 2, 350],
    ]);
  });

  it("widens the window with daysBefore and goes quiet when disabled", async () => {
    const { u } = await borrowerWithSchedule();
    expect((await put("/api/reminders/settings", u.headers, { enabled: true, daysBefore: 14 })).status).toBe(200);
    expect((await reminders(u.headers)).reminders.map((r) => r.number)).toEqual([1, 2, 3, 4]);
    await put("/api/reminders/settings", u.headers, { enabled: false, daysBefore: 14 });
    const off = await reminders(u.headers);
    expect(off.reminders).toEqual([]);
    expect(off.settings).toEqual({ enabled: false, daysBefore: 14 });
  });
});

describe("PUT /api/reminders/settings", () => {
  it("saves and echoes the settings", async () => {
    const u = await user();
    const res = await put("/api/reminders/settings", u.headers, { enabled: true, daysBefore: 7 });
    expect(await res.json()).toEqual({ settings: { enabled: true, daysBefore: 7 } });
  });

  it("rejects bad input", async () => {
    const u = await user();
    for (const body of [{ enabled: "yes", daysBefore: 3 }, { enabled: true, daysBefore: 0 }, { enabled: true, daysBefore: 15 }, { enabled: true, daysBefore: 2.5 }, {}]) {
      expect((await put("/api/reminders/settings", u.headers, body)).status).toBe(400);
    }
  });

  it("requires sign-in", async () => {
    expect((await put("/api/reminders/settings", {}, { enabled: true, daysBefore: 3 })).status).toBe(401);
  });
});
