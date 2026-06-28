import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";

const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Stripe ────────────────────────────────────────────────────────────────────

async function stripePost<T>(path: string, body: Record<string, string>, secretKey: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json() as T & { error?: { message: string } };
  if (!res.ok) throw new Error((json as { error?: { message: string } }).error?.message ?? "Stripe error");
  return json;
}

async function stripeGet<T>(path: string, secretKey: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = await res.json() as T & { error?: { message: string } };
  if (!res.ok) throw new Error((json as { error?: { message: string } }).error?.message ?? "Stripe error");
  return json;
}

// Creates a PaymentIntent; frontend uses Stripe.js to collect card details.
payments.post("/stripe/intent", requireAuth, async (c) => {
  const { loanId } = await c.req.json<{ loanId: string }>();
  const userId = c.var.userId;

  const loan = await c.env.DB.prepare(
    "SELECT id, upfront_required, upfront_amount, upfront_paid, borrower_id FROM loans WHERE id = ? AND borrower_id = ?"
  ).bind(loanId, userId).first<{
    id: string; upfront_required: number; upfront_amount: number; upfront_paid: number; borrower_id: string;
  }>();

  if (!loan) return c.json({ error: "Loan not found" }, 404);
  if (!loan.upfront_required) return c.json({ error: "No upfront required for this loan" }, 400);
  if (loan.upfront_paid) return c.json({ error: "Upfront already paid" }, 409);

  const amountCents = Math.round(loan.upfront_amount * 100);

  const intent = await stripePost<{ id: string; client_secret: string }>(
    "/payment_intents",
    {
      amount: String(amountCents),
      currency: "usd",
      metadata: JSON.stringify({ loanId, userId }),
      description: `Upfront deposit for loan ${loanId}`,
    },
    c.env.STRIPE_SECRET_KEY
  );

  return c.json({ clientSecret: intent.client_secret, intentId: intent.id, amount: loan.upfront_amount });
});

// Confirms a completed PaymentIntent and marks the loan's upfront as paid.
payments.post("/stripe/confirm", requireAuth, async (c) => {
  const { loanId, intentId } = await c.req.json<{ loanId: string; intentId: string }>();
  const userId = c.var.userId;

  const intent = await stripeGet<{ id: string; status: string; metadata: { loanId: string; userId: string } }>(
    `/payment_intents/${intentId}`,
    c.env.STRIPE_SECRET_KEY
  );

  if (intent.status !== "succeeded") {
    return c.json({ error: `Payment not completed (status: ${intent.status})` }, 402);
  }
  if (intent.metadata.loanId !== loanId || intent.metadata.userId !== userId) {
    return c.json({ error: "Intent does not match loan" }, 403);
  }

  const { meta } = await c.env.DB.prepare(
    `UPDATE loans SET upfront_paid = 1, upfront_payment_id = ?, upfront_payment_method = 'stripe',
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND borrower_id = ? AND upfront_paid = 0`
  ).bind(intentId, loanId, userId).run();

  if (meta.changes === 0) return c.json({ error: "Loan not found or already paid" }, 409);

  return c.json({ ok: true, loanId });
});

// ── PayPal ────────────────────────────────────────────────────────────────────

async function paypalToken(clientId: string, secret: string): Promise<string> {
  const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// Creates a PayPal Order; frontend PayPal SDK calls createOrder with the returned orderId.
payments.post("/paypal/order", requireAuth, async (c) => {
  const { loanId } = await c.req.json<{ loanId: string }>();
  const userId = c.var.userId;

  const loan = await c.env.DB.prepare(
    "SELECT id, upfront_required, upfront_amount, upfront_paid, borrower_id FROM loans WHERE id = ? AND borrower_id = ?"
  ).bind(loanId, userId).first<{
    id: string; upfront_required: number; upfront_amount: number; upfront_paid: number; borrower_id: string;
  }>();

  if (!loan) return c.json({ error: "Loan not found" }, 404);
  if (!loan.upfront_required) return c.json({ error: "No upfront required for this loan" }, 400);
  if (loan.upfront_paid) return c.json({ error: "Upfront already paid" }, 409);

  const token = await paypalToken(c.env.PAYPAL_CLIENT_ID, c.env.PAYPAL_SECRET);

  const res = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: "USD", value: loan.upfront_amount.toFixed(2) },
        custom_id: `${loanId}::${userId}`,
        description: `Upfront deposit for loan ${loanId}`,
      }],
    }),
  });

  const order = await res.json() as { id: string; status: string; error?: unknown };
  if (!res.ok) return c.json({ error: "PayPal order creation failed" }, 502);

  return c.json({ orderId: order.id, amount: loan.upfront_amount });
});

// Captures a PayPal order after the buyer approves it in the SDK.
payments.post("/paypal/capture", requireAuth, async (c) => {
  const { loanId, orderId } = await c.req.json<{ loanId: string; orderId: string }>();
  const userId = c.var.userId;

  const token = await paypalToken(c.env.PAYPAL_CLIENT_ID, c.env.PAYPAL_SECRET);

  const res = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const capture = await res.json() as {
    status: string;
    purchase_units?: { payments?: { captures?: { custom_id?: string }[] } }[];
  };

  if (capture.status !== "COMPLETED") {
    return c.json({ error: `PayPal capture not completed (status: ${capture.status})` }, 402);
  }

  const customId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id ?? "";
  if (!customId.startsWith(`${loanId}::${userId}`)) {
    return c.json({ error: "Order does not match loan" }, 403);
  }

  const { meta } = await c.env.DB.prepare(
    `UPDATE loans SET upfront_paid = 1, upfront_payment_id = ?, upfront_payment_method = 'paypal',
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND borrower_id = ? AND upfront_paid = 0`
  ).bind(orderId, loanId, userId).run();

  if (meta.changes === 0) return c.json({ error: "Loan not found or already paid" }, 409);

  return c.json({ ok: true, loanId });
});

export default payments;
