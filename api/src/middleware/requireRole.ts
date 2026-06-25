import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../types";

export function requireRole(...allowedRoles: Variables["role"][]) {
  return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    if (!allowedRoles.includes(c.var.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  };
}
