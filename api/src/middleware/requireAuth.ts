import type { Context, Next } from "hono";
import { verifyJwt } from "../contexts/identity/infrastructure/jwt";
import type { Bindings, Variables } from "../types";

export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing token" }, 401);
  }
  const token = header.slice("Bearer ".length);

  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    const blacklisted = await c.env.LOAN_CACHE.get(`blacklist:${payload.jti}`);
    if (blacklisted) {
      return c.json({ error: "Token revoked" }, 401);
    }

    c.set("userId", payload.sub);
    c.set("role", payload.role);
    c.set("jti", payload.jti);
    c.set("exp", payload.exp);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
