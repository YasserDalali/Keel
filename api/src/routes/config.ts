import { Hono } from "hono";
import type { Bindings } from "../types";

const config = new Hono<{ Bindings: Bindings }>();

// Returns public (non-secret) client-side keys.
config.get("/", (c) =>
  c.json({
    stripePublishableKey: c.env.STRIPE_PUBLISHABLE_KEY,
    paypalClientId: c.env.PAYPAL_CLIENT_ID,
  })
);

export default config;
