import type { Money } from "../../../shared/money";
import { InstallmentNotFound, LoanNotFound } from "../domain/errors";
import type { LoanRepository } from "../domain/loan-repository";

/** Read-only questions payments asks before it opens a payment. They change nothing. */

export class QuoteDeposit {
  constructor(private loans: LoanRepository) {}

  async execute(q: { userId: string; loanId: string }): Promise<{ required: boolean; paid: boolean; amount: Money }> {
    const loan = await this.loans.byId(q.loanId);
    if (!loan || !loan.belongsTo(q.userId)) throw new LoanNotFound();
    return { required: loan.deposit.required, paid: loan.deposit.paid, amount: loan.deposit.amount };
  }
}

/** What is left on one installment of the caller's own active loan. */
export class QuoteInstallment {
  constructor(private loans: LoanRepository) {}

  async execute(q: { userId: string; loanId: string; installmentId: string }): Promise<{ number: number; remaining: Money }> {
    const loan = await this.loans.byId(q.loanId);
    if (!loan || !loan.belongsTo(q.userId) || loan.status !== "active") throw new InstallmentNotFound();
    const i = loan.installment(q.installmentId);
    return { number: i.number, remaining: i.remaining };
  }
}
