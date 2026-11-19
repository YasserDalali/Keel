import { describe, expect, it } from "vitest";
import { Deposit, DepositPolicy } from "../src/contexts/lending/domain/deposit";
import { CancellationRefused, DepositNotDue, DepositUnpaid, InstallmentNotFound, InvalidLoanTerms, InvalidPaymentAmount, LoanNotPending } from "../src/contexts/lending/domain/errors";
import type { InstallmentPaid, LoanApproved } from "../src/contexts/lending/domain/events";
import { Loan } from "../src/contexts/lending/domain/loan";
import { LoanTerms } from "../src/contexts/lending/domain/loan-terms";
import { buildRepaymentSchedule } from "../src/contexts/lending/domain/repayment-schedule";
import { RiskAssessment, RiskPolicy } from "../src/contexts/lending/domain/risk";
import { Money } from "../src/shared/money";

// Pure rules: no database, no HTTP. Each test tells the aggregate what happened and checks what it allows and records.

const at = new Date("2026-03-31T10:00:00Z");
const risk = RiskAssessment.restore({ finalScore: 80, bankSafety: 80, behavior: 80, threshold: 50 });
const terms = (principal = 1200, months = 6) => LoanTerms.of(Money.fromDollars(principal), 0.05, months);
let seq = 0;
const newId = () => `id-${++seq}`;

const apply = (o: { principal?: number; months?: number; deposit?: Deposit } = {}) =>
  Loan.apply({ id: "L1", borrowerId: "B1", terms: terms(o.principal, o.months), deposit: o.deposit ?? Deposit.none(), risk, at });

const active = (o: { principal?: number; months?: number } = {}) => {
  const loan = apply(o);
  loan.pullEvents();
  loan.approve({ by: "officer", at, newId, documentId: "doc-agreement" });
  loan.pullEvents();
  return loan;
};

describe("Money", () => {
  it("works in whole cents, so sums are exact", () => {
    expect(Money.fromDollars(0.1).plus(Money.fromDollars(0.2)).cents).toBe(30);
    expect(Money.fromDollars(1234.5).dollars).toBe(1234.5);
  });
  it("rejects non-finite amounts and fractional cents", () => {
    expect(() => Money.fromDollars(NaN)).toThrow(RangeError);
    expect(() => Money.ofCents(1.5)).toThrow(RangeError);
  });
});

describe("LoanTerms", () => {
  it("charges one flat fee on the principal", () => {
    const t = terms(2400, 12);
    expect(t.totalRepayable.dollars).toBe(2520);
    expect(t.fee.dollars).toBe(120);
  });
  it("refuses non-positive or non-finite terms", () => {
    expect(() => LoanTerms.of(Money.zero, 0.05, 6)).toThrow(InvalidLoanTerms);
    expect(() => LoanTerms.of(Money.fromDollars(100), 0.05, 0)).toThrow(InvalidLoanTerms);
    expect(() => LoanTerms.of(Money.fromDollars(100), 0.05, NaN)).toThrow(InvalidLoanTerms);
  });
});

describe("DepositPolicy", () => {
  const policy = new DepositPolicy(Money.fromDollars(5000), 0.05);
  it("asks nothing up to the threshold", () => {
    expect(policy.requirementFor(Money.fromDollars(5000)).required).toBe(false);
  });
  it("asks a percentage above it", () => {
    const d = policy.requirementFor(Money.fromDollars(6000));
    expect(d.required).toBe(true);
    expect(d.amount.dollars).toBe(300);
  });
});

describe("RiskPolicy", () => {
  const policy = new RiskPolicy(50);
  const clean = { kycStatus: "approved", fullyPaidLoans: 0, defaultedLoans: 0, overdueInstallments: 0 };
  it("weighs the bank score and the borrowing record", () => {
    const a = policy.assess(80, clean); // behaviour 85 -> 0.6*80 + 0.4*85 = 82
    expect(a.finalScore).toBe(82);
    expect(a.acceptable).toBe(true);
  });
  it("rejects a weak applicant", () => {
    expect(policy.assess(10, { ...clean, defaultedLoans: 2 }).acceptable).toBe(false);
  });
});

describe("repayment schedule", () => {
  it("makes one payment per month and the last absorbs rounding so the total is exact", () => {
    const t = terms(1000, 7); // 1050 / 7 = 150 exactly; try one that does not divide evenly
    const odd = buildRepaymentSchedule(terms(1234, 7), new Date("2026-01-31T00:00:00Z"));
    expect(odd).toHaveLength(7);
    expect(Money.sum(odd.map((p) => p.amountDue)).dollars).toBe(1295.7);
    expect(buildRepaymentSchedule(t, at).every((p) => p.amountDue.dollars === 150)).toBe(true);
  });
  it("clamps month ends (Jan 31 -> Feb 28)", () => {
    const [feb] = buildRepaymentSchedule(terms(), new Date("2026-01-31T00:00:00Z"));
    expect(feb.dueDate).toBe("2026-02-28");
  });
});

describe("applying", () => {
  it("starts pending with no schedule and announces itself", () => {
    const loan = apply();
    expect(loan.status).toBe("pending");
    expect(loan.installments).toHaveLength(0);
    expect(loan.pullEvents().map((e) => e.type)).toEqual(["lending.loan-applied"]);
  });
  it("hands its events over once", () => {
    const loan = apply();
    loan.pullEvents();
    expect(loan.pullEvents()).toEqual([]);
  });
});

describe("approving", () => {
  it("activates the loan and fixes the schedule", () => {
    const loan = apply();
    loan.approve({ by: "officer", at, newId, documentId: "doc-1" });
    expect(loan.status).toBe("active");
    expect(loan.installments).toHaveLength(6);
    expect(loan.decidedBy).toBe("officer");
    const approved = loan.pullEvents().find((e) => e.type === "lending.loan-approved") as LoanApproved;
    expect(approved.schedule).toHaveLength(6);
    expect(approved.documentId).toBe("doc-1");
  });
  it("is allowed without an officer (the demo shortcut)", () => {
    const loan = apply();
    loan.approve({ by: null, at, newId, documentId: "d" });
    expect(loan.decidedBy).toBeNull();
    expect(loan.status).toBe("active");
  });
  it("waits for a required deposit", () => {
    const loan = apply({ principal: 6000, deposit: Deposit.due(Money.fromDollars(300)) });
    expect(() => loan.approve({ by: "o", at, newId, documentId: "d" })).toThrow(DepositUnpaid);
    loan.payDeposit({ method: "paypal", reference: "ORDER1", at, documentId: "r" });
    expect(() => loan.approve({ by: "o", at, newId, documentId: "d" })).not.toThrow();
  });
  it("only a pending loan can be approved", () => {
    const loan = active();
    expect(() => loan.approve({ by: "o", at, newId, documentId: "d" })).toThrow(LoanNotPending);
  });
});

describe("deposit", () => {
  it("is refused when none is due or it is already paid", () => {
    expect(() => apply().payDeposit({ method: "stripe", reference: null, at, documentId: "r" })).toThrow(DepositNotDue);
    const loan = apply({ principal: 6000, deposit: Deposit.due(Money.fromDollars(300)) });
    loan.payDeposit({ method: "stripe", reference: "pi_1", at, documentId: "r" });
    expect(() => loan.payDeposit({ method: "stripe", reference: "pi_2", at, documentId: "r2" })).toThrow(DepositNotDue);
  });
});

describe("declining and cancelling", () => {
  it("an officer can decline a pending loan, once", () => {
    const loan = apply();
    loan.decline({ by: "officer", at });
    expect(loan.status).toBe("declined");
    expect(() => loan.decline({ by: "officer", at })).toThrow(LoanNotPending);
  });
  it("the borrower can cancel while pending", () => {
    const loan = apply();
    loan.cancel({ at });
    expect(loan.status).toBe("cancelled");
    expect(loan.cancelledAt).toEqual(at);
  });
  it("but not after funding, nor after a deposit was paid", () => {
    expect(() => active().cancel({ at })).toThrow(CancellationRefused);
    const loan = apply({ principal: 6000, deposit: Deposit.due(Money.fromDollars(300)) });
    loan.payDeposit({ method: "stripe", reference: "pi_1", at, documentId: "r" });
    expect(() => loan.cancel({ at })).toThrowError(/deposit is already paid/);
  });
});

describe("recording payments", () => {
  it("a full payment settles the installment and reports what is left", () => {
    const loan = active({ principal: 1200, months: 6 }); // 6 x 210
    const first = loan.installments[0];
    loan.recordPayment({ installmentId: first.id, amount: Money.fromDollars(210), method: "stripe", at, documentId: "rcpt" });
    expect(first.status).toBe("paid");
    const paid = loan.pullEvents().find((e) => e.type === "lending.installment-paid") as InstallmentPaid;
    expect(paid).toMatchObject({ number: 1, count: 6, amount: 210, status: "paid", remaining: 1050, documentId: "rcpt" });
    expect(loan.status).toBe("active");
  });
  it("a part payment leaves the installment partial", () => {
    const loan = active({ principal: 1200, months: 6 });
    const first = loan.installments[0];
    loan.recordPayment({ installmentId: first.id, amount: Money.fromDollars(100), method: "bank_transfer", at, documentId: "r" });
    expect(first.status).toBe("partial");
    expect(first.remaining.dollars).toBe(110);
  });
  it("paying the last installment repays the loan", () => {
    const loan = active({ principal: 1200, months: 3 });
    for (const i of loan.installments) loan.recordPayment({ installmentId: i.id, amount: i.remaining, method: "stripe", at, documentId: `r${i.number}` });
    expect(loan.status).toBe("repaid");
    expect(loan.pullEvents().map((e) => e.type)).toContain("lending.loan-repaid");
  });
  it("refuses an unknown installment and a non-positive amount", () => {
    const loan = active();
    expect(() => loan.recordPayment({ installmentId: "nope", amount: Money.fromDollars(10), method: "stripe", at, documentId: "r" })).toThrow(InstallmentNotFound);
    expect(() => loan.recordPayment({ installmentId: loan.installments[0].id, amount: Money.zero, method: "stripe", at, documentId: "r" })).toThrow(InvalidPaymentAmount);
  });
});

describe("installment status", () => {
  it("is overdue once its due date has passed without payment", () => {
    const loan = active({ months: 3 });
    const first = loan.installments[0]; // due 2026-04-30 (Mar 31 + 1 month, clamped)
    expect(first.statusOn(new Date("2026-04-30T00:00:00Z"))).toBe("unpaid");
    expect(first.statusOn(new Date("2026-05-01T00:00:00Z"))).toBe("overdue");
  });
});
