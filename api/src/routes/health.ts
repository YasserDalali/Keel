import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const health = new Hono<{ Bindings: Bindings }>();

health.get("/", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", db: "connected" });
});

export default health;
