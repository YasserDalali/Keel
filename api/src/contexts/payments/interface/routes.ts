import { Hono } from "hono";
import { requireAuth } from "../../../middleware/requireAuth";
import type { Bindings, Variables } from "../../../types";
import { InvalidPaymentRequest } from "../domain/errors";
import { fail } from "./problems";

/**
 * HTTP surface for taking money through Stripe and PayPal. Paths, statuses and bodies are unchanged; the
 * routes only parse, authorise, call a use case and shape the provider-specific response.
 */
export const paymentRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const body = async (c: { req: { json(): Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
/** loanId + installmentId, or null. */
const ids = (b: Record<string, unknown>) => (str(b.loanId) && str(b.installmentId) ? { loanId: b.loanId as string, installmentId: b.installmentId as string } : null);

const DEPOSIT_PAID = { deposit_not_due: "Loan not found or already paid" };

// ── Stripe: deposit ───────────────────────────────────────────────────────────

// Creates a PaymentIntent; the frontend uses Stripe.js to collect card details.
paymentRoutes.post("/stripe/intent", requireAuth, async (c) => {
  const stripe = c.var.services.payments.stripe;
  try {
    stripe.assertConfigured();
    const { loanId } = await body(c);
    const opened = await stripe.createDeposit.execute({ userId: c.var.userId, loanId: loanId as string });
    return c.json({ clientSecret: opened.clientSecret, intentId: opened.reference, amount: opened.amount });
  } catch (e) {
    return fail(c, e);
  }
});

// Confirms a completed PaymentIntent and marks the loan's upfront as paid.
paymentRoutes.post("/stripe/confirm", requireAuth, async (c) => {
  const stripe = c.var.services.payments.stripe;
  try {
    stripe.assertConfigured();
    const { loanId, intentId } = await body(c);
    const { documentId } = await stripe.confirmDeposit.execute({ userId: c.var.userId, loanId: loanId as string, reference: intentId as string });
    return c.json({ ok: true, loanId, documentId });
  } catch (e) {
    return fail(c, e, DEPOSIT_PAID);
  }
});

// ── Stripe: installment repayments ────────────────────────────────────────────

// PaymentIntent for what is left on one of the borrower's installments.
paymentRoutes.post("/stripe/installment-intent", requireAuth, async (c) => {
  const stripe = c.var.services.payments.stripe;
  try {
    stripe.assertConfigured();
    const target = ids(await body(c));
    if (!target) throw new InvalidPaymentRequest("loanId and installmentId are required");
    const opened = await stripe.createInstallment.execute({ userId: c.var.userId, ...target });
    return c.json({ clientSecret: opened.clientSecret, intentId: opened.reference, amount: opened.amount });
  } catch (e) {
    return fail(c, e);
  }
});

// Verifies the PaymentIntent with Stripe, then records the payment once (keyed by the intent id).
paymentRoutes.post("/stripe/installment-confirm", requireAuth, async (c) => {
  const stripe = c.var.services.payments.stripe;
  try {
    stripe.assertConfigured();
    const raw = await body(c);
    const target = ids(raw);
    const intentId = str(raw.intentId);
    if (!target || !intentId || !/^pi_\w+$/.test(intentId)) throw new InvalidPaymentRequest("loanId, installmentId and intentId are required");
    return c.json(await stripe.confirmInstallment.execute({ userId: c.var.userId, ...target, reference: intentId }));
  } catch (e) {
    return fail(c, e);
  }
});

// ── PayPal: deposit ───────────────────────────────────────────────────────────

// Creates a PayPal order; the frontend PayPal SDK calls createOrder with the returned orderId.
paymentRoutes.post("/paypal/order", requireAuth, async (c) => {
  try {
    const { loanId } = await body(c);
    const opened = await c.var.services.payments.paypal.createDeposit.execute({ userId: c.var.userId, loanId: loanId as string });
    return c.json({ orderId: opened.reference, amount: opened.amount });
  } catch (e) {
    return fail(c, e);
  }
});

// Captures a PayPal order after the buyer approves it in the SDK.
paymentRoutes.post("/paypal/capture", requireAuth, async (c) => {
  try {
    const { loanId, orderId } = await body(c);
    const { documentId } = await c.var.services.payments.paypal.confirmDeposit.execute({ userId: c.var.userId, loanId: loanId as string, reference: orderId as string });
    return c.json({ ok: true, loanId, documentId });
  } catch (e) {
    return fail(c, e, DEPOSIT_PAID);
  }
});

// ── PayPal: installment repayments ────────────────────────────────────────────

// PayPal order for what is left on one of the borrower's installments.
paymentRoutes.post("/paypal/installment-order", requireAuth, async (c) => {
  try {
    const target = ids(await body(c));
    if (!target) throw new InvalidPaymentRequest("loanId and installmentId are required");
    const opened = await c.var.services.payments.paypal.createInstallment.execute({ userId: c.var.userId, ...target });
    return c.json({ orderId: opened.reference, amount: opened.amount });
  } catch (e) {
    return fail(c, e);
  }
});

// Captures an approved order, then records the payment once. Keyed by the order id, so a repeat call returns the first result.
paymentRoutes.post("/paypal/installment-capture", requireAuth, async (c) => {
  try {
    const raw = await body(c);
    const target = ids(raw);
    const orderId = str(raw.orderId);
    if (!target || !orderId || !/^[A-Z0-9]{5,40}$/.test(orderId)) throw new InvalidPaymentRequest("loanId, installmentId and orderId are required");
    return c.json(await c.var.services.payments.paypal.confirmInstallment.execute({ userId: c.var.userId, ...target, reference: orderId }));
  } catch (e) {
    return fail(c, e);
  }
});
