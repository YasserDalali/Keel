import type { Bindings } from "../types";

const PLAID_BASE = "https://sandbox.plaid.com";
const SANDBOX_INSTITUTION = "ins_109508";

type PlaidEnv = Pick<Bindings, "PLAID_CLIENT_ID" | "PLAID_SECRET">;

export type PlaidAccount = {
  name: string;
  type: string;
  subtype: string | null;
  balances: { available: number | null; current: number | null };
};

// One POST helper for the whole sandbox API; throws on Plaid error_code / non-200.
async function plaidPost<T>(path: string, body: Record<string, unknown>, env: PlaidEnv): Promise<T> {
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
  });
  const data = (await res.json()) as Record<string, unknown> & {
    error_code?: string;
    error_message?: string;
  };
  if (!res.ok || data.error_code) {
    throw new Error(`Plaid ${path} failed: ${data.error_code ?? res.status} ${data.error_message ?? ""}`);
  }
  return data as T;
}

export async function createLinkToken(userId: string, env: PlaidEnv): Promise<string> {
  const data = await plaidPost<{ link_token: string }>(
    "/link/token/create",
    {
      user: { client_user_id: userId },
      client_name: "Microloans",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    },
    env
  );
  return data.link_token;
}

export async function sandboxCreatePublicToken(env: PlaidEnv): Promise<string> {
  const data = await plaidPost<{ public_token: string }>(
    "/sandbox/public_token/create",
    { institution_id: SANDBOX_INSTITUTION, initial_products: ["transactions"] },
    env
  );
  return data.public_token;
}

export async function exchangePublicToken(
  publicToken: string,
  env: PlaidEnv
): Promise<{ accessToken: string; itemId: string }> {
  const data = await plaidPost<{ access_token: string; item_id: string }>(
    "/item/public_token/exchange",
    { public_token: publicToken },
    env
  );
  return { accessToken: data.access_token, itemId: data.item_id };
}

export async function getBalances(accessToken: string, env: PlaidEnv): Promise<PlaidAccount[]> {
  const data = await plaidPost<{ accounts: PlaidAccount[] }>(
    "/accounts/balance/get",
    { access_token: accessToken },
    env
  );
  return data.accounts;
}
