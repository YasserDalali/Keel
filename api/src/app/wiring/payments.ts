import { QuoteDeposit, QuoteInstallment } from "../../contexts/lending/application/payment-quotes";
import { D1LoanRepository } from "../../contexts/lending/infrastructure/d1-loan-repository";
import { ConfirmDepositPayment, ConfirmInstallmentPayment, CreateDepositPayment, CreateInstallmentPayment, assertConfigured } from "../../contexts/payments/application/payment-use-cases";
import type { DepositCollector, DepositQuotes, InstallmentQuotes } from "../../contexts/payments/application/ports";
import { RecordRepayment } from "../../contexts/payments/application/record-repayment";
import { subscribePaymentsToLending } from "../../contexts/payments/application/subscribers";
import type { PaymentGateway } from "../../contexts/payments/domain/gateway";
import { D1PaymentLedger, D1ReceiptLookup } from "../../contexts/payments/infrastructure/d1-ledger";
import { PayPalGateway } from "../../contexts/payments/infrastructure/paypal-gateway";
import { StripeGateway } from "../../contexts/payments/infrastructure/stripe-gateway";
import type { Wiring } from "./shared";

export function wirePayments({ env, bus, lending }: Wiring) {
  const ledger = new D1PaymentLedger(env.DB);
  subscribePaymentsToLending(bus, ledger);

  const recordRepayment = new RecordRepayment({ find: lending.findPayableInstallment, record: lending.recordInstallmentPayment }, ledger, new D1ReceiptLookup(env.DB));

  // Adapters from lending's use cases to payments' own ports (the only place the two vocabularies meet).
  const loans = new D1LoanRepository(env.DB);
  const depositQuote = new QuoteDeposit(loans);
  const installmentQuote = new QuoteInstallment(loans);
  const deposits: DepositQuotes = { quote: (q) => depositQuote.execute(q) };
  const installments: InstallmentQuotes = { quote: (q) => installmentQuote.execute(q) };
  const collector: DepositCollector = {
    collect: (c) => lending.payDeposit.execute({ loanId: c.loanId, borrowerId: c.userId, method: c.provider, reference: c.reference }),
  };

  /** Everything one provider can do, built from the same use cases. */
  const channel = (gateway: PaymentGateway) => ({
    assertConfigured: () => assertConfigured(gateway),
    createDeposit: new CreateDepositPayment(gateway, deposits),
    confirmDeposit: new ConfirmDepositPayment(gateway, collector),
    createInstallment: new CreateInstallmentPayment(gateway, installments),
    confirmInstallment: new ConfirmInstallmentPayment(gateway, ledger, recordRepayment),
  });

  return {
    recordRepayment,
    stripe: channel(new StripeGateway(env.STRIPE_SECRET_KEY)),
    paypal: channel(new PayPalGateway(env.PAYPAL_CLIENT_ID, env.PAYPAL_SECRET)),
  };
}
