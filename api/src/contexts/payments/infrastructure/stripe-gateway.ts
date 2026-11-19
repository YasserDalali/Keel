import { Money } from "../../../shared/money";
import { PaymentProviderFailed } from "../domain/errors";
import type { OpenedPayment, PaymentGateway, PaymentRequest, SettledPayment } from "../domain/gateway";

type StripeIntent = {
  id: string; client_secret?: string; status: string; amount: number; amount_received?: number; metadata?: Record<string, string>;
  error?: { message?: string };
};

/** Stripe PaymentIntents. Everything Stripe-shaped (form encoding, metadata[...] keys, cents) stays in this file. */
export class StripeGateway implements PaymentGateway {
  readonly provider = "stripe" as const;
  readonly displayName = "Stripe";
  readonly minimum = Money.ofCents(50);
  readonly settlesOnce = false; // retrieving an intent can be repeated
  readonly wording = { incomplete: (status: string) => `Payment not completed (status: ${status})`, noun: "Intent" };

  constructor(private readonly secretKey: string | undefined) {}

  get configured(): boolean {
    return !!this.secretKey;
  }

  async open(req: PaymentRequest): Promise<OpenedPayment> {
    const form: Record<string, string> = {
      amount: String(req.amount.cents),
      currency: "usd",
      "metadata[loanId]": req.target.loanId,
      ...(req.target.installmentId ? { "metadata[installmentId]": req.target.installmentId } : {}),
      "metadata[userId]": req.target.userId,
      description: req.description,
    };
    const intent = await this.call("POST", "/payment_intents", new URLSearchParams(form).toString());
    return { reference: intent.id, clientSecret: intent.client_secret };
  }

  async settle(reference: string): Promise<SettledPayment> {
    const intent = await this.call("GET", `/payment_intents/${reference}`);
    const m = intent.metadata ?? {};
    return {
      reference: intent.id,
      completed: intent.status === "succeeded",
      status: intent.status,
      amount: Money.ofCents(Math.round(intent.amount_received ?? intent.amount)), // what Stripe collected, not what the client claims
      target: { loanId: m.loanId, installmentId: m.installmentId, userId: m.userId },
    };
  }

  private async call(method: "GET" | "POST", path: string, body?: string): Promise<StripeIntent> {
    try {
      const res = await fetch(`https://api.stripe.com/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.secretKey}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
        body,
      });
      const json = (await res.json()) as StripeIntent;
      if (!res.ok) throw new PaymentProviderFailed(json.error?.message ?? "Stripe error");
      return json;
    } catch (e) {
      if (e instanceof PaymentProviderFailed) throw e;
      throw new PaymentProviderFailed((e as Error).message || "Stripe error");
    }
  }
}
