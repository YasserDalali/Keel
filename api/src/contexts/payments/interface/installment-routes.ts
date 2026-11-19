import { Hono } from "hono";
import { problem } from "../../../app/http";
import { requireAuth } from "../../../middleware/requireAuth";
import type { Bindings, Variables } from "../../../types";

/** Manual repayment (bank transfer / demo). Lives under /api/loans/... for URL compatibility but belongs to payments. */
export const installmentRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

installmentRoutes.post("/:id/installments/:installmentId/pay", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; paymentMethod: string }>().catch(() => ({ amount: NaN, paymentMethod: "" }));
  if (!["bank_transfer", "mock_gateway"].includes(body.paymentMethod)) {
    return c.json({ error: "paymentMethod must be bank_transfer or mock_gateway (card payments go through /api/payments/stripe)" }, 400);
  }
  if (body.paymentMethod === "mock_gateway" && c.env.DEMO_MODE !== "true") return c.json({ error: "Not found" }, 404);
  try {
    const result = await c.var.services.payments.recordRepayment.execute({
      userId: c.var.userId, loanId: c.req.param("id")!, installmentId: c.req.param("installmentId")!,
      amount: body.amount, method: body.paymentMethod as "bank_transfer" | "mock_gateway",
    });
    return c.json(result);
  } catch (e) {
    return problem(c, e);
  }
});
