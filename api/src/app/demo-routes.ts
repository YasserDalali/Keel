import { Hono, type Context } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";
import { problem } from "./http";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Demo shortcuts for running without Plaid keys, a live Didit flow or an inbox. This is an adapter, not a context:
 * it owns no rules and no SQL, it only calls the same use cases the real flows call. Off unless DEMO_MODE is exactly "true".
 */
export const demoRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

demoRoutes.use("*", async (c, next) => {
  if (c.env.DEMO_MODE !== "true") return c.json({ error: "Not found" }, 404);
  await next();
});

demoRoutes.post("/complete/:step", requireAuth, async (c) => {
  const userId = c.var.userId;
  const step = c.req.param("step");
  if (step === "bank") {
    await c.var.services.borrower.completeBankLink.execute({ userId });
    return c.json({ ok: true, step });
  }
  if (step === "identity") {
    await c.var.services.borrower.approveIdentity.execute({ userId });
    return c.json({ ok: true, step });
  }
  return c.json({ error: "step must be bank or identity" }, 400);
});

/** The caller's own loan, only if it is still pending (what both loan shortcuts below require). */
async function ownPendingLoan(c: Ctx, loanId: string): Promise<boolean> {
  const found = await c.var.services.lending.get.execute({ loanId, userId: c.var.userId, staff: false }).catch(() => null);
  return found?.loan.status === "pending";
}

// Pays the caller's own required deposit without a card, through the same use case (so the same receipt and alerts) as a real one.
demoRoutes.post("/deposit/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id")!;
  if (!(await ownPendingLoan(c, loanId))) return c.json({ error: "Pending loan not found" }, 404);
  try {
    const { documentId } = await c.var.services.lending.payDeposit.execute({ loanId, borrowerId: c.var.userId, method: "demo", reference: null });
    return c.json({ ok: true, documentId });
  } catch (e) {
    return problem(c, e);
  }
});

// Approves the caller's own pending loan, with no officer. A required deposit must really be paid first (the domain answers 402).
demoRoutes.post("/approve/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id")!;
  if (!(await ownPendingLoan(c, loanId))) return c.json({ error: "Pending loan not found" }, 404);
  try {
    return c.json(await c.var.services.lending.approve.execute({ loanId, approverId: null }));
  } catch (e) {
    return problem(c, e);
  }
});

demoRoutes.post("/verify-email", requireAuth, async (c) => {
  await c.var.services.identity.markEmailVerified.execute({ userId: c.var.userId });
  return c.json({ ok: true });
});

// The caller's own emails (what would have been sent), newest first.
demoRoutes.get("/outbox", requireAuth, async (c) => {
  return c.json({ emails: await c.var.services.communication.readOutbox.execute(c.var.userId) });
});
