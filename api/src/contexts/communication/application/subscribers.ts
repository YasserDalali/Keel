import type { VerificationRequested } from "../../identity/domain/events";
import type { DepositPaid, InstallmentPaid, LoanApplied, LoanApproved, LoanCancelled, LoanDeclined } from "../../lending/domain/events";
import type { EventBus } from "../../../shared/events";
import { ref, usd } from "../domain/format";
import type { Communicator, SendEmail } from "./communicator";

/** Communication reacts to what other contexts announce. The wording of every message lives here. */
export function subscribeCommunication(bus: EventBus, comm: Communicator, email: SendEmail) {
  bus.subscribe<LoanApplied>("lending.loan-applied", async (e) => {
    await comm.notifyStaff({ kind: "loan_submitted", title: "New application", body: `${usd(e.amount)} over ${e.termMonths} months · ${ref(e.loanId)}`, link: `/app/loans/${e.loanId}` });
    await comm.emailUser(e.borrowerId, "loan_received", { loanId: e.loanId, amount: e.amount, termMonths: e.termMonths });
  });

  bus.subscribe<LoanApproved>("lending.loan-approved", async (e) => {
    const first = e.schedule[0];
    await comm.notifyUser(e.borrowerId, {
      kind: "loan_approved", title: "Your loan is approved", body: `${usd(e.amount)} is on its way. First payment ${usd(first.amountDue)} due ${first.dueDate}.`, link: `/app/loans/${e.loanId}`,
    });
    await comm.emailUser(e.borrowerId, "loan_approved", { loanId: e.loanId, amount: e.amount, monthly: first.amountDue, firstDueDate: first.dueDate });
  });

  bus.subscribe<LoanDeclined>("lending.loan-declined", async (e) => {
    await comm.notifyUser(e.borrowerId, { kind: "loan_declined", title: "Your application wasn't approved", body: `We can't offer the ${usd(e.amount)} loan right now.`, link: `/app/loans/${e.loanId}` });
    await comm.emailUser(e.borrowerId, "loan_declined", { loanId: e.loanId, amount: e.amount });
  });

  bus.subscribe<LoanCancelled>("lending.loan-cancelled", async (e) => {
    await comm.notifyStaff({ kind: "loan_cancelled", title: "Application withdrawn", body: `${usd(e.amount)} · ${ref(e.loanId)} was cancelled by the borrower.`, link: `/app/loans/${e.loanId}` });
  });

  bus.subscribe<DepositPaid>("lending.deposit-paid", async (e) => {
    await comm.notifyStaff({ kind: "deposit_paid", title: "Deposit paid", body: `${usd(e.depositAmount)} on the ${usd(e.loanAmount)} loan ${ref(e.loanId)}. Ready to review.`, link: `/app/loans/${e.loanId}` });
    await comm.emailUser(e.borrowerId, "deposit_received", { loanId: e.loanId, amount: e.depositAmount });
  });

  bus.subscribe<InstallmentPaid>("lending.installment-paid", async (e) => {
    const what = `Payment ${e.number} of ${e.count} · ${usd(e.amount)}`;
    await comm.notifyUser(e.borrowerId, {
      kind: "payment_received", title: "Payment received", body: e.remaining > 0 ? `${what}. ${usd(e.remaining)} left to repay.` : `${what}. Your loan is paid off.`, link: `/app/loans/${e.loanId}`,
    });
    await comm.notifyStaff({ kind: "payment_received", title: "Payment received", body: `${what} · ${ref(e.loanId)}`, link: `/app/loans/${e.loanId}` });
    await comm.emailUser(e.borrowerId, "payment_receipt", { loanId: e.loanId, number: e.number, count: e.count, amount: e.amount, remaining: e.remaining });
  });

  // The address comes with the event: the user may not be findable yet, and identity already knows it.
  bus.subscribe<VerificationRequested>("identity.verification-requested", (e) => email.execute(e.userId, e.email, "verify_email", { link: e.link }));
}
