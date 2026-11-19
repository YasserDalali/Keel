import { Hono } from "hono";
import type { Bindings } from "../types";

const health = new Hono<{ Bindings: Bindings }>();

health.get("/", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", db: "connected" });
});

export default health;
