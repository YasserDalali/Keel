import { Hono } from "hono";
import { hashPassword } from "../auth/password";
import { verifyTurnstile } from "../middleware/turnstile";
import type { Bindings, Variables } from "../types";

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(body.email)
    .first();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'borrower')"
  )
    .bind(id, body.email, passwordHash)
    .run();

  return c.json({ id, email: body.email }, 201);
});

export default auth;
