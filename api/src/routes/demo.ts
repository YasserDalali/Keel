import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { upsertPlaidItem } from "../plaid/items";
import { approveLoan } from "./loans";
import type { Bindings, Variables } from "../types";

// Demo shortcuts for local runs without Plaid keys or a live Didit flow.
// Off unless DEMO_MODE is exactly "true" (set it in .dev.vars only, never as a production var).
const demo = new Hono<{ Bindings: Bindings; Variables: Variables }>();

demo.use("*", async (c, next) => {
  if (c.env.DEMO_MODE !== "true") return c.json({ error: "Not found" }, 404);
  await next();
});

demo.post("/complete/:step", requireAuth, async (c) => {
  const userId = c.var.userId;
  const step = c.req.param("step");

  if (step === "bank") {
    await upsertPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
      userId,
      itemId: `demo-${userId}`,
      accessToken: "demo-access-token",
      institutionName: "Demo Bank",
      bankSafetyScore: 80,
      bankSignals: JSON.stringify({ demo: true }),
    });
    return c.json({ ok: true, step });
  }

  if (step === "identity") {
    await c.env.DB.prepare(
      `INSERT INTO profiles (user_id, kyc_status) VALUES (?, 'approved')
       ON CONFLICT(user_id) DO UPDATE SET kyc_status = 'approved'`
    )
      .bind(userId)
      .run();
    return c.json({ ok: true, step });
  }

  return c.json({ error: "step must be bank or identity" }, 400);
});

// Approves the caller's own pending loan, marking any required deposit paid first. approved_by stays NULL (no officer).
demo.post("/approve/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id")!; // the route guarantees it
  const owned = await c.env.DB.prepare("SELECT id FROM loans WHERE id = ? AND borrower_id = ? AND status = 'pending'")
    .bind(loanId, c.var.userId)
    .first();
  if (!owned) return c.json({ error: "Pending loan not found" }, 404);

  await c.env.DB.prepare(
    "UPDATE loans SET upfront_paid = 1, upfront_payment_method = 'demo' WHERE id = ? AND upfront_required = 1 AND upfront_paid = 0"
  )
    .bind(loanId)
    .run();
  const r = await approveLoan(c.env, loanId, null);
  return c.json(r.body, r.status);
});

export default demo;
