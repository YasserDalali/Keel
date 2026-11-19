import { describe, expect, it } from "vitest";
import { groupDocs, titleOf, type StatementDoc } from "./statements-data";

const doc = (id: string, documentType: string, createdAt: string, loanId: string | null = "L1"): StatementDoc => ({ id, documentType, createdAt, loanId, referenceId: null });

const docs = [
  doc("a", "loan_agreement", "2026-10-02 09:00:00"),
  doc("b", "payment_receipt", "2026-11-17 10:00:00"),
  doc("c", "statement", "2025-12-31 23:00:00", null),
  doc("d", "deposit_receipt", "2026-11-03 08:00:00", "L2"),
];

describe("groupDocs", () => {
  it("groups newest first by year then month", () => {
    const g = groupDocs(docs);
    expect(g.map((y) => y.year)).toEqual(["2026", "2025"]);
    expect(g[0].months.map((m) => [m.month, m.docs.map((d) => d.id)])).toEqual([["2026-11", ["b", "d"]], ["2026-10", ["a"]]]);
  });
  it("filters by kind (deposit receipts count as receipts) and loan", () => {
    expect(groupDocs(docs, "receipts").flatMap((y) => y.months.flatMap((m) => m.docs.map((d) => d.id)))).toEqual(["b", "d"]);
    expect(groupDocs(docs, "all", "L2").flatMap((y) => y.months.flatMap((m) => m.docs.map((d) => d.id)))).toEqual(["d"]);
    expect(groupDocs(docs, "statements")[0].year).toBe("2025");
  });
  it("falls back to a readable title", () => {
    expect(titleOf(docs[0])).toBe("Loan agreement");
    expect(titleOf({ ...docs[1], title: "Receipt · payment 3 of 12" })).toBe("Receipt · payment 3 of 12");
  });
});
