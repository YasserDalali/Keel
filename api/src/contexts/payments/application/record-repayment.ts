import { InvalidPaymentAmount } from "../../lending/domain/errors";
import type { FindPayableInstallment, RecordInstallmentPayment } from "../../lending/application/use-cases";
import { Money } from "../../../shared/money";
import type { LedgerMethod, PaymentLedger, ReceiptLookup } from "../domain/ledger";

/**
 * A borrower's repayment arrived (card, PayPal, bank transfer, demo). Coordinates the two contexts involved:
 * payments records the money, lending applies it to the schedule. Safe to repeat for the same provider
 * reference: the second call returns the first result instead of applying the money twice.
 */
export class RecordRepayment {
  constructor(
    private lending: { find: FindPayableInstallment; record: RecordInstallmentPayment },
    private ledger: PaymentLedger,
    private receipts: ReceiptLookup,
  ) {}

  async execute(cmd: { userId: string; loanId: string; installmentId: string; amount: number; method: LedgerMethod; externalRef?: string }) {
    const target = await this.lending.find.execute(cmd); // not yours / no such installment -> 404
    if (!(typeof cmd.amount === "number" && Number.isFinite(cmd.amount) && cmd.amount > 0)) throw new InvalidPaymentAmount();

    const isNew = await this.ledger.recordRepayment({
      loanId: cmd.loanId, installmentId: cmd.installmentId, amount: Money.fromDollars(cmd.amount), method: cmd.method, externalRef: cmd.externalRef,
    });
    if (!isNew) return { installmentId: cmd.installmentId, status: target.status, documentId: await this.receipts.forInstallment(cmd.installmentId) };

    return this.lending.record.execute(cmd);
  }
}
