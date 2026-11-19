import { Hono, type Context } from "hono";
import { requireAuth } from "../../../middleware/requireAuth";
import type { Bindings, Variables } from "../../../types";
import { InvalidReportRequest } from "../domain/errors";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

/** Borrowers always get themselves; officers/admins may read someone else with ?userId=. */
export function targetUserId(c: Ctx): string {
  const asked = c.req.query("userId");
  const staff = c.var.role === "officer" || c.var.role === "admin";
  return staff && asked ? asked : c.var.userId;
}

const badRequest = (c: Ctx, e: unknown) => {
  if (e instanceof InvalidReportRequest) return c.json({ error: e.message }, 400);
  throw e;
};

/** Read-only HTTP surface of the reporting context: schedule, transactions, reminders and history. */
export const scheduleRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
scheduleRoutes.get("/", requireAuth, async (c) => c.json({ installments: await c.var.services.reporting.schedule.execute(targetUserId(c)) }));

export const transactionRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
transactionRoutes.get("/", requireAuth, async (c) => {
  const { loanId, type, from, to } = c.req.query();
  try {
    return c.json({ transactions: await c.var.services.reporting.transactions.execute(targetUserId(c), { loanId, type, from, to }) });
  } catch (e) {
    return badRequest(c, e);
  }
});

export const reminderRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
reminderRoutes.get("/", requireAuth, async (c) => c.json(await c.var.services.reporting.reminders.execute(targetUserId(c))));
reminderRoutes.put("/settings", requireAuth, async (c) => {
  const body = await c.req.json<{ enabled?: unknown; daysBefore?: unknown }>().catch(() => ({}));
  try {
    return c.json({ settings: await c.var.services.reporting.updateReminderSettings.execute(c.var.userId, body) });
  } catch (e) {
    return badRequest(c, e);
  }
});

export const historyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
historyRoutes.get("/", requireAuth, async (c) => c.json(await c.var.services.reporting.history.execute(targetUserId(c))));
