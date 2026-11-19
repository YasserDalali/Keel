import type { Clock } from "../../../shared/clock";
import { dateOf } from "../../../shared/clock";
import type { EventBus } from "../../../shared/events";
import type { IdGenerator } from "../../../shared/ids";
import { Money } from "../../../shared/money";
import {
  ApplicationRejected, DepositNotDue, InstallmentNotFound, InvalidPaymentAmount, LoanNotFound, LoanNotPending,
} from "../domain/errors";
import { Loan } from "../domain/loan";
import type { LoanRepository } from "../domain/loan-repository";
import { LoanTerms } from "../domain/loan-terms";
import { RiskPolicy } from "../domain/risk";
import type { ApplicantGateway, LendingPolicy, LoanFilter, LoanQueries } from "./ports";

type Deps = { loans: LoanRepository; bus: EventBus; clock: Clock; ids: IdGenerator };

/** Application services: each is one thing a user or another context can ask lending to do. They load the aggregate,
 *  tell it what to do, save it, then publish what happened. The rules live in the aggregate, not here. */

export class ApplyForLoan {
  constructor(private d: Deps, private applicants: ApplicantGateway, private policy: LendingPolicy) {}

  async execute(cmd: { borrowerId: string; amount: number; termMonths: number }) {
    const principal = Number.isFinite(cmd.amount) ? Money.fromDollars(cmd.amount) : Money.zero;
    const terms = LoanTerms.of(principal, this.policy.flatRate, cmd.termMonths);

    const applicant = await this.applicants.describe(cmd.borrowerId);
    if (!applicant.emailVerified) throw new ApplicationRejected("email_unverified", "Confirm your email address before applying for a loan", { code: "email_unverified" });
    if (applicant.kycStatus !== "approved") throw new ApplicationRejected("identity_unverified", "KYC verification required before applying for a loan");
    if (applicant.bankSafetyScore === null) throw new ApplicationRejected("bank_required", "Bank audit required; connect a bank via /api/plaid/connect first");

    const record = { ...(await this.d.loans.recordOf(cmd.borrowerId)), kycStatus: applicant.kycStatus };
    const risk = new RiskPolicy(this.policy.riskThreshold).assess(applicant.bankSafetyScore, record);
    if (!risk.acceptable) throw new ApplicationRejected("risk_too_high", "Risk score below threshold", { finalScore: risk.finalScore, summary: risk.summary() });

    const loan = Loan.apply({
      id: this.d.ids.next(), borrowerId: cmd.borrowerId, terms, risk, deposit: this.policy.deposit.requirementFor(principal), at: this.d.clock.now(),
    });
    await this.d.loans.save(loan);
    await this.d.bus.publish(loan.pullEvents());
    return {
      id: loan.id, status: "pending" as const, riskScore: risk.finalScore,
      upfrontRequired: loan.deposit.required, upfrontAmount: loan.deposit.amount.dollars,
    };
  }
}

export class ApproveLoan {
  constructor(private d: Deps) {}

  /** `approverId` is null for the demo shortcut, which approves without an officer. */
  async execute(cmd: { loanId: string; approverId: string | null }) {
    const loan = await this.d.loans.byId(cmd.loanId);
    if (!loan) throw new LoanNotPending();
    const documentId = this.d.ids.next();
    loan.approve({ by: cmd.approverId, at: this.d.clock.now(), newId: () => this.d.ids.next(), documentId });
    await this.d.loans.save(loan);
    await this.d.bus.publish(loan.pullEvents());
    return { id: loan.id, status: "active" as const, installmentCount: loan.installments.length, documentId };
  }
}

export class DeclineLoan {
  constructor(private d: Deps) {}

  async execute(cmd: { loanId: string; officerId: string }) {
    const loan = await this.d.loans.byId(cmd.loanId);
    if (!loan) throw new LoanNotPending();
    loan.decline({ by: cmd.officerId, at: this.d.clock.now() });
    await this.d.loans.save(loan);
    await this.d.bus.publish(loan.pullEvents());
    return { id: loan.id };
  }
}

export class CancelLoan {
  constructor(private d: Deps) {}

  async execute(cmd: { loanId: string; borrowerId: string }) {
    const loan = await this.d.loans.byId(cmd.loanId);
    if (!loan || !loan.belongsTo(cmd.borrowerId)) throw new LoanNotFound();
    loan.cancel({ at: this.d.clock.now() });
    await this.d.loans.save(loan);
    await this.d.bus.publish(loan.pullEvents());
    return { id: loan.id };
  }
}

export class PayDeposit {
  constructor(private d: Deps) {}

  /** A deposit arrived through some payment channel. Returns the id reserved for its receipt. */
  async execute(cmd: { loanId: string; borrowerId: string; method: string; reference: string | null }) {
    const loan = await this.d.loans.byId(cmd.loanId);
    if (!loan || !loan.belongsTo(cmd.borrowerId)) throw new DepositNotDue();
    const documentId = this.d.ids.next();
    loan.payDeposit({ method: cmd.method, reference: cmd.reference, at: this.d.clock.now(), documentId });
    await this.d.loans.save(loan);
    await this.d.bus.publish(loan.pullEvents());
    return { documentId };
  }
}

/** Answers "may this person pay this installment, and where does it stand?" without changing anything. */
export class FindPayableInstallment {
  constructor(private loans: LoanRepository) {}

  async execute(q: { userId: string; loanId: string; installmentId: string }) {
    const loan = await this.loans.byId(q.loanId);
    if (!loan || !loan.belongsTo(q.userId)) throw new InstallmentNotFound();
    const i = loan.installment(q.installmentId);
    return { installmentId: i.id, status: i.status, number: i.number, count: loan.installments.length, remaining: i.remaining.dollars };
  }
}

export class RecordInstallmentPayment {
  constructor(private d: Deps) {}

  async execute(cmd: { userId: string; loanId: string; installmentId: string; amount: number; method: string }) {
    const loan = await this.d.loans.byId(cmd.loanId);
    if (!loan || !loan.belongsTo(cmd.userId)) throw new InstallmentNotFound();
    loan.installment(cmd.installmentId); // 404 before 400, as before
    if (!(typeof cmd.amount === "number" && Number.isFinite(cmd.amount) && cmd.amount > 0)) throw new InvalidPaymentAmount();
    const documentId = this.d.ids.next();
    loan.recordPayment({ installmentId: cmd.installmentId, amount: Money.fromDollars(cmd.amount), method: cmd.method, at: this.d.clock.now(), documentId });
    await this.d.loans.save(loan);
    await this.d.bus.publish(loan.pullEvents());
    return { installmentId: cmd.installmentId, status: loan.installment(cmd.installmentId).status, documentId };
  }
}

export class MarkOverdueInstallments {
  constructor(private loans: LoanRepository, private clock: Clock) {}
  execute(): Promise<number> {
    return this.loans.markOverdue(dateOf(this.clock.now()));
  }
}

export class ListLoans {
  constructor(private queries: LoanQueries) {}
  /** Borrowers see only their own loans; officers and admins see everyone's. */
  execute(q: { userId: string; staff: boolean; status?: string }) {
    const filter: LoanFilter = { status: q.status, borrowerId: q.staff ? undefined : q.userId };
    return this.queries.list(filter);
  }
}

export class GetLoan {
  constructor(private queries: LoanQueries) {}
  async execute(q: { loanId: string; userId: string; staff: boolean }) {
    const detail = await this.queries.detail(q.loanId);
    if (!detail || (!q.staff && detail.loan.borrower_id !== q.userId)) throw new LoanNotFound();
    return detail;
  }
}
