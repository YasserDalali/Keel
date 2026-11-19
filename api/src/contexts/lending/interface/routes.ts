import { Hono } from "hono";
import { problem } from "../../../app/http";
import { requireAuth } from "../../../middleware/requireAuth";
import { requireRole } from "../../../middleware/requireRole";
import type { Bindings, Variables } from "../../../types";

/** HTTP surface of the lending context. No SQL and no rules here: parse, authorise, call a use case, shape the response. */
export const lendingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const isStaff = (role: string) => role === "officer" || role === "admin";

lendingRoutes.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; termMonths: number }>().catch(() => ({ amount: NaN, termMonths: NaN }));
  try {
    const applied = await c.var.services.lending.apply.execute({ borrowerId: c.var.userId, amount: body.amount, termMonths: body.termMonths });
    return c.json(applied, 201);
  } catch (e) {
    return problem(c, e);
  }
});

lendingRoutes.get("/", requireAuth, async (c) => {
  const loans = await c.var.services.lending.list.execute({ userId: c.var.userId, staff: isStaff(c.var.role), status: c.req.query("status") });
  return c.json({ loans });
});

lendingRoutes.get("/:id", requireAuth, async (c) => {
  try {
    return c.json(await c.var.services.lending.get.execute({ loanId: c.req.param("id")!, userId: c.var.userId, staff: isStaff(c.var.role) }));
  } catch (e) {
    return problem(c, e);
  }
});

lendingRoutes.post("/:id/approve", requireAuth, requireRole("officer", "admin"), async (c) => {
  try {
    return c.json(await c.var.services.lending.approve.execute({ loanId: c.req.param("id")!, approverId: c.var.userId }));
  } catch (e) {
    return problem(c, e);
  }
});

// The API keeps reporting "defaulted" for declined and cancelled loans, as it always has; clients tell them apart by cancelled/approved fields.
lendingRoutes.post("/:id/cancel", requireAuth, async (c) => {
  try {
    const { id } = await c.var.services.lending.cancel.execute({ loanId: c.req.param("id")!, borrowerId: c.var.userId });
    return c.json({ id, status: "defaulted", cancelled: true });
  } catch (e) {
    return problem(c, e);
  }
});

lendingRoutes.post("/:id/reject", requireAuth, requireRole("officer", "admin"), async (c) => {
  try {
    const { id } = await c.var.services.lending.decline.execute({ loanId: c.req.param("id")!, officerId: c.var.userId });
    return c.json({ id, status: "defaulted" });
  } catch (e) {
    return problem(c, e);
  }
});
