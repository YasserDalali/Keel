import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";
import { verifyTurnstile } from "../middleware/turnstile";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const email = body.email.toLowerCase();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'borrower')"
  )
    .bind(id, email, passwordHash)
    .run();

  return c.json({ id, email }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const email = body.email.toLowerCase();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, role FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{ id: string; password_hash: string; role: "borrower" | "officer" | "admin" }>();

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signJwt({ sub: user.id, role: user.role }, c.env.JWT_SECRET, 3600);
  return c.json({ token });
});

auth.post("/logout", requireAuth, async (c) => {
  const jti = c.var.jti;
  const exp = c.var.exp;
  const ttl = exp - Math.floor(Date.now() / 1000);

  if (ttl >= 60) {
    await c.env.LOAN_CACHE.put(`blacklist:${jti}`, "1", { expirationTtl: ttl });
  }

  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const userId = c.var.userId;
  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ userId, email: user.email, role: c.var.role });
});

export default auth;
