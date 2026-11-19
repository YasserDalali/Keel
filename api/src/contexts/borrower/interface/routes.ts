import { Hono } from "hono";
import { requireAuth } from "../../../middleware/requireAuth";
import { requireRole } from "../../../middleware/requireRole";
import type { Bindings, Variables } from "../../../types";
import { reply } from "./http";

type App = { Bindings: Bindings; Variables: Variables };

/** /api/profile */
export const profileRoutes = new Hono<App>();

profileRoutes.get("/", requireAuth, async (c) => c.json(await c.var.services.borrower.ownProfile.execute({ userId: c.var.userId })));

profileRoutes.put("/", requireAuth, async (c) => {
  const details = await c.req.json<{ firstName?: string; lastName?: string; phone?: string; address?: string; nationalIdNumber?: string }>();
  try {
    await c.var.services.borrower.saveDetails.execute({ userId: c.var.userId, details });
    return c.json({ ok: true });
  } catch (e) {
    return reply(c, e);
  }
});

profileRoutes.get("/:userId", requireAuth, requireRole("officer", "admin"), async (c) => {
  try {
    return c.json(await c.var.services.borrower.profileForStaff.execute({ userId: c.req.param("userId")! }));
  } catch (e) {
    return reply(c, e);
  }
});

/** /api/kyc */
export const kycRoutes = new Hono<App>();

kycRoutes.post("/session", requireAuth, async (c) => {
  try {
    return c.json(await c.var.services.borrower.startVerification.execute({ userId: c.var.userId }));
  } catch (e) {
    return reply(c, e);
  }
});

kycRoutes.post("/refresh", requireAuth, async (c) => {
  try {
    return c.json(await c.var.services.borrower.refreshVerification.execute({ userId: c.var.userId }));
  } catch (e) {
    return reply(c, e);
  }
});

/** /api/plaid */
export const bankRoutes = new Hono<App>();

bankRoutes.post("/link-token", requireAuth, async (c) => {
  try {
    return c.json(await c.var.services.borrower.createBankLinkToken.execute({ userId: c.var.userId }));
  } catch (e) {
    return reply(c, e);
  }
});

bankRoutes.post("/connect", requireAuth, async (c) => {
  const { publicToken } = await c.req.json<{ publicToken: string }>();
  try {
    return c.json(await c.var.services.borrower.connectBank.execute({ userId: c.var.userId, publicToken }));
  } catch (e) {
    return reply(c, e);
  }
});

/** /api/webhooks (provider callbacks; authenticated by signature, not by session) */
export const webhookRoutes = new Hono<App>();

webhookRoutes.post("/didit", async (c) => {
  const outcome = await c.var.services.borrower.verificationWebhook.execute({
    rawBody: await c.req.text(), signature: c.req.header("x-signature-v2") ?? "", timestamp: c.req.header("x-timestamp"),
  });
  const answers = { ok: ["ok", 200], stale: ["stale", 401], invalid_json: ["invalid json", 400], bad_signature: ["bad sig", 401] } as const;
  const [body, status] = answers[outcome];
  return new Response(body, { status });
});
