import { Hono } from "hono";
import { DomainError } from "../../../shared/errors";
import { requireAuth } from "../../../middleware/requireAuth";
import type { Bindings, Variables } from "../../../types";

/** Notifications inbox: list your own, mark them read. */
const notifications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

notifications.get("/", requireAuth, async (c) => c.json(await c.var.services.communication.getInbox.execute(c.var.userId)));

notifications.post("/read", requireAuth, async (c) => {
  const body = await c.req.json<{ ids?: unknown }>().catch(() => ({} as { ids?: unknown }));
  try {
    await c.var.services.communication.markRead.execute(c.var.userId, body.ids);
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError && e.code === "invalid_ids") return c.json({ error: e.message }, 400);
    throw e;
  }
});

export default notifications;
