import { Hono } from "hono";
import { requireAuth } from "../../../middleware/requireAuth";
import { verifyTurnstile } from "../../../middleware/turnstile";
import type { Bindings, Variables } from "../../../types";
import { reply } from "./http";

/** HTTP surface of identity: sign-up, sign-in, sessions, and email verification. */
export const identityRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** Public origin for links: APP_URL when set, else the request's own origin. */
const baseUrl = (env: Bindings, reqUrl: string) => (env.APP_URL || new URL(reqUrl).origin).replace(/\/$/, "");

identityRoutes.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();
  if (!(await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET))) return c.json({ error: "Turnstile verification failed" }, 403);
  try {
    return c.json(await c.var.services.identity.register.execute({ email: body.email, password: body.password, baseUrl: baseUrl(c.env, c.req.url) }), 201);
  } catch (e) {
    return reply(c, e);
  }
});

identityRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();
  if (!(await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET))) return c.json({ error: "Turnstile verification failed" }, 403);
  try {
    return c.json(await c.var.services.identity.login.execute({ email: body.email, password: body.password }));
  } catch (e) {
    return reply(c, e);
  }
});

identityRoutes.post("/logout", requireAuth, async (c) => {
  await c.var.services.identity.logout.execute({ jti: c.var.jti, exp: c.var.exp });
  return c.json({ ok: true });
});

identityRoutes.get("/me", requireAuth, async (c) => {
  try {
    const me = await c.var.services.identity.account.execute({ userId: c.var.userId });
    return c.json({ userId: c.var.userId, email: me.email, role: c.var.role, emailVerified: me.emailVerified });
  } catch (e) {
    return reply(c, e);
  }
});

identityRoutes.post("/verify-email", async (c) => {
  const { token } = await c.req.json<{ token?: unknown }>().catch(() => ({ token: undefined }));
  try {
    await c.var.services.identity.verifyEmail.execute({ token });
    return c.json({ ok: true });
  } catch (e) {
    return reply(c, e);
  }
});

identityRoutes.post("/resend-verification", requireAuth, async (c) => {
  try {
    const r = await c.var.services.identity.resendVerification.execute({ userId: c.var.userId, baseUrl: baseUrl(c.env, c.req.url) });
    return c.json(r.alreadyVerified ? { ok: true, alreadyVerified: true } : { ok: true });
  } catch (e) {
    return reply(c, e);
  }
});

