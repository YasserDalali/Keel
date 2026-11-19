import { Money } from "../../../shared/money";
import { DepositNotDue } from "./errors";

export type DepositMethod = "stripe" | "paypal" | "demo" | string;

/** The upfront deposit a large loan requires before it can be approved. */
export class Deposit {
  private constructor(
    readonly required: boolean,
    readonly amount: Money,
    readonly paid: boolean,
    readonly method: DepositMethod | null,
    readonly reference: string | null,
    readonly paidAt: Date | null,
  ) {}

  static none(): Deposit { return new Deposit(false, Money.zero, false, null, null, null); }
  static due(amount: Money): Deposit { return new Deposit(true, amount, false, null, null, null); }
  static restore(p: { required: boolean; amount: Money; paid: boolean; method: string | null; reference: string | null; paidAt: Date | null }): Deposit {
    return new Deposit(p.required, p.amount, p.paid, p.method, p.reference, p.paidAt);
  }

  /** True when nothing blocks approval: no deposit needed, or it's paid. */
  get satisfied(): boolean { return !this.required || this.paid; }

  pay(method: DepositMethod, at: Date, reference: string | null): Deposit {
    if (!this.required || this.paid) throw new DepositNotDue();
    return new Deposit(true, this.amount, true, method, reference, at);
  }
}

/** Loans above the threshold must put down a percentage first. */
export class DepositPolicy {
  constructor(readonly threshold: Money, readonly pct: number) {}

  requirementFor(principal: Money): Deposit {
    return principal.gt(this.threshold) ? Deposit.due(principal.times(this.pct)) : Deposit.none();
  }
}
