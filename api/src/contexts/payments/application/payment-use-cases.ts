import type { Money } from "../../../shared/money";
import {
  AmountBelowMinimum, DepositAlreadyPaid, DepositNotRequired, InstallmentAlreadyPaid, ProviderNotConfigured,
} from "../domain/errors";
import type { PaymentGateway } from "../domain/gateway";
import type { PaymentLedger } from "../domain/ledger";
import { verifySettlement } from "../domain/verification";
import type { DepositCollector, DepositQuotes, InstallmentQuotes } from "./ports";
import type { RecordRepayment } from "./record-repayment";

/** Application services for taking money through a provider. Each is built once per provider (Stripe, PayPal). */

export function assertConfigured(gateway: PaymentGateway): void {
  if (!gateway.configured) throw new ProviderNotConfigured(gateway.displayName);
}

const dollars = (m: Money) => `$${(m.cents / 100).toFixed(2)}`;

function checkMinimum(gateway: PaymentGateway, amount: Money, what: string): void {
  if (gateway.minimum && !amount.gte(gateway.minimum)) throw new AmountBelowMinimum(what, gateway.displayName, dollars(gateway.minimum));
}

/** Opens a payment for the borrower's upfront deposit. */
export class CreateDepositPayment {
  constructor(private gateway: PaymentGateway, private deposits: DepositQuotes) {}

  async execute(cmd: { userId: string; loanId: string }) {
    const deposit = await this.deposits.quote(cmd);
    if (!deposit.required) throw new DepositNotRequired();
    if (deposit.paid) throw new DepositAlreadyPaid();
    checkMinimum(this.gateway, deposit.amount, "Upfront amount");
    assertConfigured(this.gateway);
    const opened = await this.gateway.open({
      amount: deposit.amount, description: `Upfront deposit for loan ${cmd.loanId}`, target: { loanId: cmd.loanId, userId: cmd.userId },
    });
    return { ...opened, amount: deposit.amount.dollars };
  }
}

/** The borrower finished paying the deposit: verify with the provider, then tell lending. */
export class ConfirmDepositPayment {
  constructor(private gateway: PaymentGateway, private collector: DepositCollector) {}

  async execute(cmd: { userId: string; loanId: string; reference: string }) {
    assertConfigured(this.gateway);
    const settled = await this.gateway.settle(cmd.reference);
    verifySettlement(settled, { loanId: cmd.loanId, userId: cmd.userId }, this.gateway);
    return this.collector.collect({ userId: cmd.userId, loanId: cmd.loanId, provider: this.gateway.provider, reference: cmd.reference });
  }
}

/** Opens a payment for what is left on one installment. */
export class CreateInstallmentPayment {
  constructor(private gateway: PaymentGateway, private installments: InstallmentQuotes) {}

  async execute(cmd: { userId: string; loanId: string; installmentId: string }) {
    const inst = await this.installments.quote(cmd);
    if (!inst.remaining.isPositive()) throw new InstallmentAlreadyPaid();
    checkMinimum(this.gateway, inst.remaining, "Amount");
    assertConfigured(this.gateway);
    const opened = await this.gateway.open({
      amount: inst.remaining, description: `Payment ${inst.number} for loan ${cmd.loanId}`,
      target: { loanId: cmd.loanId, installmentId: cmd.installmentId, userId: cmd.userId },
    });
    return { ...opened, amount: inst.remaining.dollars };
  }
}

/** The borrower finished paying an installment: verify with the provider, then record what was actually collected (once). */
export class ConfirmInstallmentPayment {
  constructor(private gateway: PaymentGateway, private ledger: PaymentLedger, private repayments: RecordRepayment) {}

  async execute(cmd: { userId: string; loanId: string; installmentId: string; reference: string }) {
    const record = (amount: number) =>
      this.repayments.execute({ userId: cmd.userId, loanId: cmd.loanId, installmentId: cmd.installmentId, amount, method: this.gateway.provider, externalRef: cmd.reference });

    // A provider that settles only once (PayPal capture) can't be asked again: a repeat is answered from the ledger.
    // (The repayment is already recorded, so the amount passed here is ignored; it only has to be valid.)
    if (this.gateway.settlesOnce && (await this.ledger.hasRepayment(cmd.reference, cmd.installmentId))) return record(0.01);

    assertConfigured(this.gateway);
    const settled = await this.gateway.settle(cmd.reference);
    verifySettlement(settled, { loanId: cmd.loanId, installmentId: cmd.installmentId, userId: cmd.userId }, this.gateway);
    return record(settled.amount.dollars);
  }
}
