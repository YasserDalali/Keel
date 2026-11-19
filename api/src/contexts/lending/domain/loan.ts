import { Money } from "../../../shared/money";
import type { DomainEvent } from "../../../shared/events";
import { Deposit, type DepositMethod } from "./deposit";
import {
  CancellationRefused, DepositUnpaid, InstallmentNotFound, InvalidPaymentAmount, LoanNotPending,
} from "./errors";
import type { LendingEvent } from "./events";
import { Installment } from "./installment";
import { buildRepaymentSchedule } from "./repayment-schedule";
import type { LoanTerms } from "./loan-terms";
import type { RiskAssessment } from "./risk";

/**
 * Where a loan is in its life.
 *   pending -> active -> repaid          (the happy path)
 *   pending -> declined | cancelled      (never funded)
 *   active  -> defaulted                 (set by collections; nothing in the app does it yet)
 */
export type LoanStatus = "pending" | "active" | "repaid" | "declined" | "cancelled" | "defaulted";

export type LoanState = {
  id: string;
  borrowerId: string;
  terms: LoanTerms;
  risk: RiskAssessment | null;
  status: LoanStatus;
  deposit: Deposit;
  installments: Installment[];
  createdAt: Date;
  /** Officer who approved or declined; null when approved by the demo shortcut or still pending. */
  decidedBy: string | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
};

/**
 * Aggregate root. Everything that must stay consistent about one loan (status, deposit, schedule, payments)
 * changes only through these methods, each of which enforces its own rules and records what happened as an event.
 * It refers to the borrower by id only: borrowers belong to another aggregate (and another context).
 */
export class Loan {
  private readonly events: DomainEvent[] = [];

  private constructor(private state: LoanState) {}

  /** Factory for a new application. It starts pending, with no schedule. */
  static apply(p: { id: string; borrowerId: string; terms: LoanTerms; deposit: Deposit; risk: RiskAssessment; at: Date }): Loan {
    const loan = new Loan({
      id: p.id, borrowerId: p.borrowerId, terms: p.terms, risk: p.risk, status: "pending", deposit: p.deposit,
      installments: [], createdAt: p.at, decidedBy: null, approvedAt: null, cancelledAt: null,
    });
    loan.record<LendingEvent>({
      type: "lending.loan-applied", occurredAt: p.at,
      loanId: p.id, borrowerId: p.borrowerId, amount: p.terms.principal.dollars, termMonths: p.terms.termMonths,
    });
    return loan;
  }

  /** Rebuilds a stored loan. Used by repositories only; raises no events. */
  static restore(state: LoanState): Loan {
    return new Loan(state);
  }

  // ── reading ───────────────────────────────────────────────────────────────
  get id(): string { return this.state.id; }
  get borrowerId(): string { return this.state.borrowerId; }
  get terms(): LoanTerms { return this.state.terms; }
  get risk(): RiskAssessment | null { return this.state.risk; }
  get status(): LoanStatus { return this.state.status; }
  get deposit(): Deposit { return this.state.deposit; }
  get installments(): readonly Installment[] { return this.state.installments; }
  get createdAt(): Date { return this.state.createdAt; }
  get decidedBy(): string | null { return this.state.decidedBy; }
  get approvedAt(): Date | null { return this.state.approvedAt; }
  get cancelledAt(): Date | null { return this.state.cancelledAt; }

  belongsTo(borrowerId: string): boolean { return this.state.borrowerId === borrowerId; }
  get isPending(): boolean { return this.state.status === "pending"; }
  /** What the borrower still owes across all installments. */
  get remaining(): Money { return Money.sum(this.state.installments.map((i) => i.remaining)); }

  installment(id: string): Installment {
    const found = this.state.installments.find((i) => i.id === id);
    if (!found) throw new InstallmentNotFound();
    return found;
  }

  /** Events raised since the last call, for the application layer to publish after the loan is saved. */
  pullEvents(): DomainEvent[] {
    return this.events.splice(0);
  }

  // ── behaviour ─────────────────────────────────────────────────────────────

  /** A deposit arrived. The loan must have one due. */
  payDeposit(p: { method: DepositMethod; reference: string | null; at: Date; documentId: string }): void {
    this.state.deposit = this.state.deposit.pay(p.method, p.at, p.reference);
    this.record<LendingEvent>({
      type: "lending.deposit-paid", occurredAt: p.at, loanId: this.id, borrowerId: this.borrowerId,
      depositAmount: this.state.deposit.amount.dollars, loanAmount: this.terms.principal.dollars, method: p.method, documentId: p.documentId,
    });
  }

  /**
   * Fund the loan: it becomes active and its repayment schedule is fixed.
   * Refused unless it is pending and any required deposit is paid.
   */
  approve(p: { by: string | null; at: Date; newId: () => string; documentId: string }): void {
    this.requirePending();
    if (!this.state.deposit.satisfied) throw new DepositUnpaid();
    const plan = buildRepaymentSchedule(this.terms, p.at);
    this.state.installments = plan.map((x) => Installment.schedule(p.newId(), x.number, x.dueDate, x.amountDue));
    this.state.status = "active";
    this.state.decidedBy = p.by;
    this.state.approvedAt = p.at;
    this.record<LendingEvent>({
      type: "lending.loan-approved", occurredAt: p.at, loanId: this.id, borrowerId: this.borrowerId, approvedBy: p.by,
      amount: this.terms.principal.dollars, flatRate: this.terms.flatRate, termMonths: this.terms.termMonths,
      schedule: plan.map((x) => ({ number: x.number, dueDate: x.dueDate, amountDue: x.amountDue.dollars })), documentId: p.documentId,
    });
  }

  /** An officer turns the application down. */
  decline(p: { by: string; at: Date }): void {
    this.requirePending();
    this.state.status = "declined";
    this.state.decidedBy = p.by;
    this.record<LendingEvent>({ type: "lending.loan-declined", occurredAt: p.at, loanId: this.id, borrowerId: this.borrowerId, amount: this.terms.principal.dollars });
  }

  /** The borrower withdraws. Only while pending, and only before any deposit was paid (money would need refunding). */
  cancel(p: { at: Date }): void {
    if (!this.isPending) throw new CancellationRefused("not_pending");
    if (this.state.deposit.paid) throw new CancellationRefused("deposit_paid");
    this.state.status = "cancelled";
    this.state.cancelledAt = p.at;
    this.record<LendingEvent>({ type: "lending.loan-cancelled", occurredAt: p.at, loanId: this.id, borrowerId: this.borrowerId, amount: this.terms.principal.dollars });
  }

  /** Money received against one installment. The loan is repaid when the last installment is settled. */
  recordPayment(p: { installmentId: string; amount: Money; method: string; at: Date; documentId: string }): void {
    const installment = this.installment(p.installmentId);
    if (!p.amount.isPositive()) throw new InvalidPaymentAmount();
    installment.applyPayment(p.amount, p.at);
    this.record<LendingEvent>({
      type: "lending.installment-paid", occurredAt: p.at, loanId: this.id, borrowerId: this.borrowerId,
      installmentId: installment.id, number: installment.number, count: this.state.installments.length,
      amount: p.amount.dollars, status: installment.status === "paid" ? "paid" : "partial",
      remaining: this.remaining.dollars, method: p.method, documentId: p.documentId,
    });
    if (this.state.installments.every((i) => i.settled)) {
      this.state.status = "repaid";
      this.record<LendingEvent>({ type: "lending.loan-repaid", occurredAt: p.at, loanId: this.id, borrowerId: this.borrowerId });
    }
  }

  private requirePending(): void {
    if (!this.isPending) throw new LoanNotPending();
  }

  private record<E extends DomainEvent>(event: E): void {
    this.events.push(event);
  }
}

