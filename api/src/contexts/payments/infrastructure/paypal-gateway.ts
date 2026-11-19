import { Money } from "../../../shared/money";
import { PaymentProviderFailed } from "../domain/errors";
import type { OpenedPayment, PaymentGateway, PaymentRequest, PaymentTarget, SettledPayment } from "../domain/gateway";

const BASE = "https://api-m.sandbox.paypal.com";

type Capture = {
  status?: string;
  purchase_units?: { payments?: { captures?: { status?: string; custom_id?: string; amount?: { value?: string } }[] } }[];
};

// What a payment is for travels in PayPal's `custom_id`: "loanId::userId" for a deposit, "loanId:installmentId:userId" for an installment.
const encodeTarget = (t: PaymentTarget) => `${t.loanId}:${t.installmentId ?? ""}:${t.userId}`;
function decodeTarget(customId: string | undefined): Partial<PaymentTarget> | null {
  if (!customId) return null;
  const parts = customId.split(":");
  if (parts.length !== 3) return null;
  return { loanId: parts[0], installmentId: parts[1] || undefined, userId: parts[2] };
}

/** PayPal Orders (sandbox). Everything PayPal-shaped (OAuth token, purchase units, captures) stays in this file. */
export class PayPalGateway implements PaymentGateway {
  readonly provider = "paypal" as const;
  readonly displayName = "PayPal";
  readonly minimum = null;
  readonly settlesOnce = true; // capturing an order consumes it
  readonly wording = { incomplete: (status: string) => `PayPal capture not completed (status: ${status})`, noun: "Order" };

  constructor(private readonly clientId: string | undefined, private readonly secret: string | undefined) {}

  get configured(): boolean {
    return !!this.clientId && !!this.secret;
  }

  async open(req: PaymentRequest): Promise<OpenedPayment> {
    const failed = () => new PaymentProviderFailed("PayPal order creation failed");
    try {
      const token = await this.token();
      const res = await fetch(`${BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "USD", value: req.amount.dollars.toFixed(2) },
            custom_id: encodeTarget(req.target),
            description: req.description,
          }],
        }),
      });
      const order = (await res.json()) as { id?: string };
      if (!res.ok || !order.id) throw failed();
      return { reference: order.id };
    } catch (e) {
      console.error("[paypal] order creation:", (e as Error).message);
      throw failed();
    }
  }

  async settle(reference: string): Promise<SettledPayment> {
    try {
      const token = await this.token();
      const res = await fetch(`${BASE}/v2/checkout/orders/${reference}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const capture = (await res.json()) as Capture;
      const cap = capture.purchase_units?.[0]?.payments?.captures?.[0];
      return {
        reference,
        completed: capture.status === "COMPLETED" && !!cap,
        status: capture.status ?? "unknown",
        amount: Money.fromDollars(Number(cap?.amount?.value ?? 0)), // what PayPal captured, not what the client claims
        target: decodeTarget(cap?.custom_id),
      };
    } catch (e) {
      console.error("[paypal] capture:", (e as Error).message);
      throw new PaymentProviderFailed("PayPal capture failed");
    }
  }

  private async token(): Promise<string> {
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${this.clientId}:${this.secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("PayPal sign-in failed");
    return data.access_token;
  }
}
