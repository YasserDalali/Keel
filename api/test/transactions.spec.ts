import { describe, expect, it } from "vitest";
import { get, loan, stamp, txn, user } from "./phase4-helpers";

type Txn = { id: string; loanId: string; installmentId: string | null; type: string; amount: number; method: string; status: string; createdAt: string };
const list = async (h: Record<string, string>, q = "") => {
  const res = await get(`/api/transactions${q}`, h);
  return { status: res.status, txns: res.ok ? (await res.json<{ transactions: Txn[] }>()).transactions : [] };
};

describe("GET /api/transactions", () => {
  it("lists the borrower's transactions newest first, with a synthesized deposit row", async () => {
    const u = await user();
    const l = await loan(u.id, { amount: 6000, upfrontRequired: 1, upfrontAmount: 300, upfrontPaid: 1, upfrontMethod: "stripe", upfrontPaidAt: stamp(-30) });
    await txn(l, { type: "disbursement", amount: 6000, createdAt: stamp(-29) });
    await txn(l, { type: "repayment", amount: 350, createdAt: stamp(-1) });
    const { txns } = await list(u.headers);
    expect(txns.map((t) => t.type)).toEqual(["repayment", "disbursement", "deposit"]);
    expect(txns[2]).toMatchObject({ id: `deposit-${l}`, loanId: l, amount: 300, method: "stripe", status: "completed", installmentId: null });
  });

  it("maps interest charges to fee", async () => {
    const u = await user();
    const l = await loan(u.id);
    await txn(l, { type: "interest_charge", amount: 5 });
    expect((await list(u.headers)).txns[0].type).toBe("fee");
  });

  it("filters by loanId, type and date range", async () => {
    const u = await user();
    const a = await loan(u.id, { upfrontRequired: 1, upfrontAmount: 50, upfrontPaid: 1, upfrontMethod: "paypal", upfrontPaidAt: stamp(-10) });
    const b = await loan(u.id);
    await txn(a, { type: "repayment", amount: 100, createdAt: stamp(-5) });
    await txn(b, { type: "repayment", amount: 200, createdAt: stamp(-40) });
    expect((await list(u.headers, `?loanId=${b}`)).txns.map((t) => t.amount)).toEqual([200]);
    expect((await list(u.headers, "?type=deposit")).txns.map((t) => t.amount)).toEqual([50]);
    const from = stamp(-20).slice(0, 10);
    const to = stamp(-6).slice(0, 10);
    expect((await list(u.headers, `?from=${from}&to=${to}`)).txns.map((t) => t.type)).toEqual(["deposit"]);
  });

  it("rejects bad filters", async () => {
    const u = await user();
    expect((await list(u.headers, "?type=bogus")).status).toBe(400);
    expect((await list(u.headers, "?from=yesterday")).status).toBe(400);
  });

  it("only shows the borrower's own records; staff can read with ?userId", async () => {
    const owner = await user();
    const other = await user();
    const officer = await user("officer");
    await txn(await loan(owner.id), { type: "repayment", amount: 10 });
    expect((await list(other.headers, `?userId=${owner.id}`)).txns).toEqual([]);
    expect((await list(officer.headers, `?userId=${owner.id}`)).txns).toHaveLength(1);
  });
});
