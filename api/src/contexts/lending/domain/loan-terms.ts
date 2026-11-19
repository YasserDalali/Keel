import { Money } from "../../../shared/money";
import { InvalidLoanTerms } from "./errors";

/** What was agreed: how much, at what flat rate, over how many months. */
export class LoanTerms {
  private constructor(
    readonly principal: Money,
    /** Flat fee as a fraction of principal, charged once (0.05 = 5%). */
    readonly flatRate: number,
    readonly termMonths: number,
  ) {}

  static of(principal: Money, flatRate: number, termMonths: number): LoanTerms {
    if (!principal.isPositive() || !(termMonths > 0) || !Number.isFinite(termMonths) || !(flatRate >= 0)) throw new InvalidLoanTerms();
    return new LoanTerms(principal, flatRate, termMonths);
  }

  get totalRepayable(): Money { return this.principal.times(1 + this.flatRate); }
  get fee(): Money { return this.totalRepayable.minus(this.principal); }
}
