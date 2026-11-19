import type { UserRegistered } from "../../identity/domain/events";
import type { DepositPaid, InstallmentPaid, LoanApproved } from "../../lending/domain/events";
import type { DomainEvent, EventBus } from "../../../shared/events";
import type { DocumentRepository, NewDocument } from "../domain/document";
import type { DocumentRenderer } from "./ports";

/**
 * Documents reacts to what other contexts announce by issuing the matching PDF under the id the event reserved,
 * so whoever raised the event can already hand that id back. A failed render is logged, never thrown.
 */
export function subscribeDocuments(bus: EventBus, renderer: DocumentRenderer, repo: DocumentRepository) {
  const issue = <E extends DomainEvent>(type: E["type"], make: (e: E) => Promise<{ doc: NewDocument; pdf: Uint8Array }>) =>
    bus.subscribe<E>(type, async (e) => {
      try {
        const { doc, pdf } = await make(e);
        await repo.add(doc, pdf);
      } catch (err) {
        console.error(`[documents] could not issue a document for ${type}:`, (err as Error).message);
      }
    });

  issue<LoanApproved>("lending.loan-approved", async (e) => ({
    doc: { id: e.documentId, ownerId: e.borrowerId, type: "loan_agreement", referenceId: e.loanId },
    pdf: await renderer.loanAgreement({
      docId: e.documentId, loanId: e.loanId, borrowerId: e.borrowerId, amount: e.amount, interestRate: e.flatRate, termMonths: e.termMonths,
      schedule: e.schedule.map((s) => ({ installmentNumber: s.number, dueDate: s.dueDate, amountDue: s.amountDue })),
    }),
  }));

  issue<DepositPaid>("lending.deposit-paid", async (e) => ({
    doc: { id: e.documentId, ownerId: e.borrowerId, type: "deposit_receipt", referenceId: e.loanId },
    pdf: await renderer.depositReceipt({ docId: e.documentId, loanId: e.loanId, amount: e.depositAmount, loanAmount: e.loanAmount, method: e.method, paidAt: e.occurredAt.toISOString() }),
  }));

  issue<InstallmentPaid>("lending.installment-paid", async (e) => ({
    doc: { id: e.documentId, ownerId: e.borrowerId, type: "payment_receipt", referenceId: e.installmentId },
    pdf: await renderer.paymentReceipt({
      docId: e.documentId, loanId: e.loanId, installmentId: e.installmentId, installmentNumber: e.number, installmentCount: e.count,
      amountPaid: e.amount, paymentMethod: e.method, installmentStatus: e.status, paidAt: e.occurredAt.toISOString(), loanRemaining: e.remaining,
    }),
  }));

  issue<UserRegistered>("identity.user-registered", async (e) => ({
    doc: { id: e.documentId, ownerId: e.userId, type: "account_opened" },
    pdf: await renderer.accountOpened({ docId: e.documentId, userId: e.userId, email: e.email, createdAt: e.occurredAt.toISOString() }),
  }));
}
