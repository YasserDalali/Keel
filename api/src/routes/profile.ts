import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { getProfile, upsertProfile } from "../profiles";
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

profile.put("/", requireAuth, async (c) => {
  const body = await c.req.json<{
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    nationalIdNumber?: string;
  }>();

  const { firstName, lastName, phone, address, nationalIdNumber } = body;
  if (!firstName || !lastName || !phone || !address || !nationalIdNumber) {
    return c.json(
      { error: "All fields are required: firstName, lastName, phone, address, nationalIdNumber" },
      400
    );
  }

  await upsertProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
    userId: c.var.userId,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
  });

  return c.json({ ok: true });
});

profile.get("/:userId", requireAuth, requireRole("officer", "admin"), async (c) => {
  const userId = c.req.param("userId");
  const record = await getProfile(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  if (!record) return c.json({ error: "Profile not found" }, 404);
  return c.json({ profile: record });
});

export default profile;
