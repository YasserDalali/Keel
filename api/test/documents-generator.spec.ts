import { describe, expect, it } from "vitest";
import {
  generateAccountOpenedPdf,
  generateLoanAgreementPdf,
  generatePaymentReceiptPdf,
} from "../src/documents/generator";

const PDF_MAGIC = "%PDF";

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 4)) === PDF_MAGIC;
}

const SCHEDULE = [
  { installmentNumber: 1, dueDate: "2026-07-28", amountDue: 105.0 },
  { installmentNumber: 2, dueDate: "2026-08-28", amountDue: 105.0 },
  { installmentNumber: 3, dueDate: "2026-09-28", amountDue: 105.0 },
];

describe("generateAccountOpenedPdf", () => {
  it("returns a valid PDF binary", async () => {
    const bytes = await generateAccountOpenedPdf({
      docId: "doc-001",
      userId: "user-001",
      email: "jane@example.com",
      createdAt: "2026-06-28T00:00:00.000Z",
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isPdf(bytes)).toBe(true);
  });
});

describe("generateLoanAgreementPdf", () => {
  it("returns a valid PDF binary", async () => {
    const bytes = await generateLoanAgreementPdf({
      docId: "doc-002",
      loanId: "loan-001",
      borrowerId: "user-001",
      amount: 300,
      interestRate: 0.05,
      termMonths: 3,
      schedule: SCHEDULE,
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isPdf(bytes)).toBe(true);
  });
});

describe("generatePaymentReceiptPdf", () => {
  it("returns a valid PDF binary", async () => {
    const bytes = await generatePaymentReceiptPdf({
      docId: "doc-003",
      loanId: "loan-001",
      installmentId: "inst-001",
      installmentNumber: 1,
      amountPaid: 105.0,
      paymentMethod: "mock_gateway",
      installmentStatus: "paid",
      paidAt: "2026-06-28T12:00:00.000Z",
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isPdf(bytes)).toBe(true);
  });
});
