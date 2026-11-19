import { DepositPolicy } from "../../contexts/lending/domain/deposit";
import { GetBorrowerStanding } from "../../contexts/borrower/application/use-cases";
import { D1BankLinkRepository } from "../../contexts/borrower/infrastructure/d1-bank-link-repository";
import { D1ProfileRepository } from "../../contexts/borrower/infrastructure/d1-profile-repository";
import { GetAccount } from "../../contexts/identity/application/use-cases";
import { D1UserRepository } from "../../contexts/identity/infrastructure/d1-user-repository";
import { CompositeApplicantGateway } from "../../contexts/lending/infrastructure/applicant-gateway";
import { D1LoanQueries } from "../../contexts/lending/infrastructure/d1-loan-queries";
import { D1LoanRepository } from "../../contexts/lending/infrastructure/d1-loan-repository";
import {
  ApplyForLoan, ApproveLoan, CancelLoan, DeclineLoan, FindPayableInstallment, GetLoan, ListLoans, MarkOverdueInstallments, PayDeposit, RecordInstallmentPayment,
} from "../../contexts/lending/application/use-cases";
import { Money } from "../../shared/money";
import type { Bindings } from "../../types";
import type { Clock } from "../../shared/clock";
import type { EventBus } from "../../shared/events";
import type { IdGenerator } from "../../shared/ids";

export function wireLending(env: Bindings, bus: EventBus, clock: Clock, ids: IdGenerator) {
  const loans = new D1LoanRepository(env.DB);
  const deps = { loans, bus, clock, ids };
  const policy = {
    flatRate: Number(env.LOAN_FLAT_INTEREST_RATE),
    riskThreshold: Number(env.RISK_SCORE_THRESHOLD),
    deposit: new DepositPolicy(Money.fromDollars(Number(env.LOAN_UPFRONT_THRESHOLD)), Number(env.LOAN_UPFRONT_PCT)),
  };
  // Lending asks identity and borrower two questions; this is where they are answered.
  const account = new GetAccount(new D1UserRepository(env.DB));
  const standing = new GetBorrowerStanding(new D1ProfileRepository(env.DB, env.PII_ENCRYPTION_KEY), new D1BankLinkRepository(env.DB, env.PII_ENCRYPTION_KEY));
  const applicants = new CompositeApplicantGateway({
    emailVerified: (userId) => account.execute({ userId }).then((a) => a.emailVerified, () => false),
    standing: (userId) => standing.execute({ userId }),
  });
  const queries = new D1LoanQueries(env.DB, () => clock.now());
  return {
    apply: new ApplyForLoan(deps, applicants, policy),
    approve: new ApproveLoan(deps),
    decline: new DeclineLoan(deps),
    cancel: new CancelLoan(deps),
    payDeposit: new PayDeposit(deps),
    findPayableInstallment: new FindPayableInstallment(loans),
    recordInstallmentPayment: new RecordInstallmentPayment(deps),
    markOverdue: new MarkOverdueInstallments(loans, clock),
    list: new ListLoans(queries),
    get: new GetLoan(queries),
  };
}
export type LendingServices = ReturnType<typeof wireLending>;
