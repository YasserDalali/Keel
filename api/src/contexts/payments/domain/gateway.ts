import type { Money } from "../../../shared/money";

export type Provider = "stripe" | "paypal";

/** What a payment is for. Travels with the payment through the provider so we can check it came back for the right thing. */
export type PaymentTarget = { loanId: string; userId: string; installmentId?: string };

export type PaymentRequest = { amount: Money; description: string; target: PaymentTarget };

/** A payment the provider has opened for the buyer to complete (a Stripe PaymentIntent, a PayPal order). */
export type OpenedPayment = {
  /** The provider's id for it; what we later confirm and what makes recording idempotent. */
  reference: string;
  /** Present for providers whose client needs a secret to collect the money (Stripe). */
  clientSecret?: string;
};

/** What the provider reports once asked to settle a payment. Provider vocabulary stops at the gateway. */
export type SettledPayment = {
  reference: string;
  /** True only when the money has really been collected. */
  completed: boolean;
  /** The provider's own status word, for error messages. */
  status: string;
  /** What was actually collected: the only trustworthy amount. */
  amount: Money;
  /** The target stored when the payment was opened, as the provider returned it. */
  target: Partial<PaymentTarget> | null;
};

/** How a provider words things to the user. */
export type Wording = { incomplete(status: string): string; noun: string };

/**
 * Port to a payment provider (anti-corruption layer): the rest of the system speaks in these terms and never
 * sees Stripe or PayPal JSON.
 */
export interface PaymentGateway {
  readonly provider: Provider;
  readonly displayName: string;
  readonly configured: boolean;
  /** Smallest amount the provider accepts, if any. */
  readonly minimum: Money | null;
  /** True when confirming consumes the payment (PayPal capture): asking twice would fail, so repeats must be answered from the ledger. */
  readonly settlesOnce: boolean;
  readonly wording: Wording;
  open(request: PaymentRequest): Promise<OpenedPayment>;
  /** Asks the provider for the outcome (Stripe: retrieve the intent; PayPal: capture the order). */
  settle(reference: string): Promise<SettledPayment>;
}
