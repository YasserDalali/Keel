import { describe, expect, it } from "vitest";
import { filterTxns, groupByMonth, monthGrid, nextUnpaid, progressByLoan, shiftMonth, toCsv, toIcs, toneOf, type ScheduleItem, type Txn } from "./history";

const item = (o: Partial<ScheduleItem>): ScheduleItem => ({
  id: "i1", loanId: "abcdef12-0000", loanAmount: 2400, number: 1, count: 12, dueDate: "2026-12-17",
  amountDue: 210, amountPaid: 0, status: "unpaid", paidAt: null, onTime: null, ...o,
});

describe("monthGrid", () => {
  it("starts weeks on Monday and pads with neighbouring days", () => {
    const g = monthGrid("2026-12"); // Dec 1 2026 is a Tuesday
    expect(g[0][0]).toEqual({ date: "2026-11-30", inMonth: false });
    expect(g[0][1]).toEqual({ date: "2026-12-01", inMonth: true });
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });
  it("moves across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });
});

describe("groupByMonth", () => {
  it("totals what is due, paid and left per month", () => {
    const g = groupByMonth([
      item({ id: "a", dueDate: "2027-01-17", number: 2 }),
      item({ id: "b", dueDate: "2026-12-17", amountPaid: 210, status: "paid" }),
      item({ id: "c", dueDate: "2027-01-03", loanId: "zz", amountDue: 100, amountPaid: 40, status: "partial" }),
    ]);
    expect(g.map((m) => m.month)).toEqual(["2026-12", "2027-01"]);
    expect(g[1]).toMatchObject({ due: 310, paid: 40, left: 270 });
    expect(g[1].items.map((i) => i.id)).toEqual(["c", "a"]);
  });
});

describe("tones", () => {
  it("marks the soonest unpaid installment as next", () => {
    const rows = [item({ id: "p", status: "paid", dueDate: "2026-11-01" }), item({ id: "n", dueDate: "2026-12-01" }), item({ id: "l", dueDate: "2027-01-01" })];
    const next = nextUnpaid(rows)!;
    expect(next.id).toBe("n");
    expect(rows.map((r) => toneOf(r, next.id))).toEqual(["paid", "next", "due"]);
  });
});

describe("toIcs", () => {
  it("adds one all-day event per unpaid installment, escaped, CRLF", () => {
    const ics = toIcs([item({ id: "x1" }), item({ id: "x2", status: "paid" })], new Date("2026-11-17T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:x1@keel");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261217");
    expect(ics).toContain("DTEND;VALUE=DATE:20261218");
    expect(ics).toContain("SUMMARY:Keel payment 1 of 12: $210");
    expect(ics).toContain("DESCRIPTION:Loan ABCDEF12 ($2\\,400). Pay in your Keel account.");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

const txn = (o: Partial<Txn>): Txn => ({
  id: "t1", loanId: "L1", installmentId: null, type: "repayment", amount: 210, method: "mock_gateway", status: "completed", createdAt: "2026-11-17 10:00:00", ...o,
});

describe("transactions", () => {
  const rows = [
    txn({ id: "a", type: "disbursement", amount: 2400, createdAt: "2026-08-02 09:00:00" }),
    txn({ id: "b", createdAt: "2026-11-17 10:00:00" }),
    txn({ id: "c", loanId: "L2", type: "deposit", method: "stripe", amount: 300, createdAt: "2026-11-10 08:00:00" }),
  ];
  it("filters by type, loan, date range and text", () => {
    expect(filterTxns(rows, { type: "repayment" }).map((t) => t.id)).toEqual(["b"]);
    expect(filterTxns(rows, { loanId: "L2" }).map((t) => t.id)).toEqual(["c"]);
    expect(filterTxns(rows, { from: "2026-11-01", to: "2026-11-15" }).map((t) => t.id)).toEqual(["c"]);
    expect(filterTxns(rows, { q: "stripe" }).map((t) => t.id)).toEqual(["c"]);
    expect(filterTxns(rows, { q: "money sent" }).map((t) => t.id)).toEqual(["a"]);
  });
  it("exports RFC 4180 CSV with quoting", () => {
    const csv = toCsv([txn({ method: 'bank, "wire"' })]);
    const [head, row] = csv.trim().split("\r\n");
    expect(head).toBe("Date,Type,Amount (USD),Method,Status,Loan,Installment,Reference");
    expect(row).toBe('2026-11-17,Repayment,210.00,"bank, ""wire""",completed,L1,,t1');
  });
});

describe("progressByLoan", () => {
  it("sums repaid against due per loan", () => {
    const p = progressByLoan([item({ amountPaid: 210, status: "paid" }), item({ id: "i2", number: 2, dueDate: "2027-01-17" })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ due: 420, paid: 210, made: 1, count: 12, lastDue: "2027-01-17", fraction: 0.5 });
  });
});
