import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { createLinkToken, sandboxCreatePublicToken, exchangePublicToken, getBalances } from "../plaid/client";
import { bankSafetyScore } from "../plaid/scoring";
import { upsertPlaidItem } from "../plaid/items";
import type { Bindings, Variables } from "../types";

const plaid = new Hono<{ Bindings: Bindings; Variables: Variables }>();

plaid.post("/link-token", requireAuth, async (c) => {
  try {
    const linkToken = await createLinkToken(c.var.userId, c.env);
    return c.json({ linkToken });
  } catch (e) {
    return c.json({ error: `Failed to create link token: ${(e as Error).message}` }, 502);
  }
});

plaid.post("/connect", requireAuth, async (c) => {
  const userId = c.var.userId;

  let accounts;
  let itemId: string;
  let accessToken: string;
  try {
    const publicToken = await sandboxCreatePublicToken(c.env);
    const exchanged = await exchangePublicToken(publicToken, c.env);
    accessToken = exchanged.accessToken;
    itemId = exchanged.itemId;
    accounts = await getBalances(accessToken, c.env);
  } catch (e) {
    return c.json({ error: `Bank connection failed: ${(e as Error).message}` }, 502);
  }

  const score = bankSafetyScore(accounts);
  const signals = {
    liquidDepository: accounts
      .filter((a) => a.type === "depository")
      .reduce((s, a) => s + (a.balances.available ?? 0), 0),
    accountCount: accounts.length,
  };

  await upsertPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, {
    userId,
    itemId,
    accessToken,
    institutionName: "First Platypus Bank",
    bankSafetyScore: score,
    bankSignals: JSON.stringify(signals),
  });

  return c.json({ bankSafetyScore: score, signals });
});

export default plaid;
