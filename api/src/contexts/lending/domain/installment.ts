import { dateOf } from "../../../shared/clock";
import { Money } from "../../../shared/money";
import { effectiveInstallmentStatus } from "../../../shared/overdue";

export type InstallmentStatus = "unpaid" | "partial" | "paid" | "overdue";

/** One scheduled repayment. An entity inside the Loan aggregate: it has no meaning or life outside its loan. */
export class Installment {
  private constructor(
    readonly id: string,
    readonly number: number,
    /** YYYY-MM-DD */
    readonly dueDate: string,
    readonly amountDue: Money,
    private _amountPaid: Money,
    private _status: InstallmentStatus,
    private _paidAt: Date | null,
  ) {}

  static schedule(id: string, number: number, dueDate: string, amountDue: Money): Installment {
    return new Installment(id, number, dueDate, amountDue, Money.zero, "unpaid", null);
  }

  static restore(p: { id: string; number: number; dueDate: string; amountDue: Money; amountPaid: Money; status: InstallmentStatus; paidAt: Date | null }): Installment {
    return new Installment(p.id, p.number, p.dueDate, p.amountDue, p.amountPaid, p.status, p.paidAt);
  }

  get amountPaid(): Money { return this._amountPaid; }
  get status(): InstallmentStatus { return this._status; }
  get paidAt(): Date | null { return this._paidAt; }
  get remaining(): Money { return this.amountDue.minus(this._amountPaid).floorAtZero(); }
  get settled(): boolean { return this._status === "paid"; }

  applyPayment(amount: Money, at: Date): void {
    this._amountPaid = this._amountPaid.plus(amount);
    if (this._amountPaid.gte(this.amountDue)) {
      this._status = "paid";
      this._paidAt = at;
    } else {
      this._status = "partial"; // also clears a stored "overdue": the borrower is paying again
    }
  }

  statusOn(today: Date): InstallmentStatus {
    return effectiveInstallmentStatus(this._status, this.dueDate, dateOf(today));
  }
}

export { effectiveInstallmentStatus };
