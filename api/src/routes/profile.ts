import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { getProfile } from "../profiles";
import { getPlaidItem } from "../plaid/items";
import type { Bindings, Variables } from "../types";

const profile = new Hono<{ Bindings: Bindings; Variables: Variables }>();

profile.get("/", requireAuth, async (c) => {
  const userId = c.var.userId;
  const record = await getProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  const bank = await getPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);

  return c.json({
    profile: record,
    kycStatus: record?.kycStatus ?? null,
    bankConnected: bank !== null,
    bankSafetyScore: bank?.bankSafetyScore ?? null,
  });
});

export default profile;
