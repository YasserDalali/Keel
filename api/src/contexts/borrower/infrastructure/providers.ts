import type { Bindings } from "../../../types";
import type { BankLinkProvider, EventDeduplicator, VerificationProvider, VerificationWebhook } from "../application/ports";
import { VerificationSessionFailed } from "../domain/errors";
import type { KycStatus } from "../domain/profile";
import { canonicalWebhookBody, verifyWebhookSignatureV2 } from "./didit-signature";
import { createLinkToken, exchangePublicToken, getBalances } from "./plaid-client";

/** Didit's status vocabulary translated into ours. Unknown statuses map to null and are ignored. */
export function toKycStatus(diditStatus: string): KycStatus | null {
  switch (diditStatus) {
    case "Approved": return "approved";
    case "Declined": return "declined";
    case "In Review": return "in_review";
    case "In Progress": case "Awaiting User": return "in_progress";
    case "Not Started": return "pending";
    case "Abandoned": return "abandoned";
    case "Expired": case "Kyc Expired": return "expired";
    case "Resubmitted": return "resubmitted";
    default: return null;
  }
}

export const diditProvider = (env: Bindings): VerificationProvider => ({
  async openSession(userId) {
    const res = await fetch(env.DIDIT_SESSION_CREATE_URL, {
      method: "POST",
      headers: { "x-api-key": env.DIDIT_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_id: env.DIDIT_WORKFLOW_ID, vendor_data: userId }),
    });
    if (!res.ok) throw new VerificationSessionFailed(await res.text());
    const s = (await res.json()) as { session_id: string; url: string; status: string };
    return { url: s.url, sessionId: s.session_id, status: toKycStatus(s.status) };
  },

  async decisionOf(sessionId) {
    const res = await fetch(new URL(`${sessionId}/decision/`, env.DIDIT_SESSION_CREATE_URL), { headers: { "x-api-key": env.DIDIT_API_KEY } });
    if (!res.ok) return null;
    const d = (await res.json()) as { status?: string };
    return { status: d.status ? toKycStatus(d.status) : null };
  },

  async readWebhook(rawBody, signature, timestampHeader): Promise<VerificationWebhook> {
    const ts = Number(timestampHeader);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return { kind: "stale" };
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { kind: "invalid_json" };
    }
    if (!(await verifyWebhookSignatureV2(env.DIDIT_WEBHOOK_SECRET, canonicalWebhookBody(parsed), signature))) return { kind: "bad_signature" };
    const status = parsed.status as string | undefined;
    return {
      kind: "event",
      eventId: parsed.event_id as string | undefined,
      type: parsed.webhook_type as string | undefined,
      userId: parsed.vendor_data as string | undefined,
      sessionId: parsed.session_id as string | undefined,
      status: status ? toKycStatus(status) : null,
    };
  },
});

export const kvDeduplicator = (kv: KVNamespace): EventDeduplicator => ({
  async firstTime(eventId) {
    const key = `didit:event:${eventId}`;
    if (await kv.get(key)) return false;
    await kv.put(key, "1", { expirationTtl: 86400 });
    return true;
  },
});

export const plaidProvider = (env: Bindings): BankLinkProvider => ({
  createLinkToken: (userId) => createLinkToken(userId, env),
  async connect(publicToken) {
    const { accessToken, itemId } = await exchangePublicToken(publicToken, env);
    const accounts = await getBalances(accessToken, env);
    return { itemId, accessToken, institutionName: "First Platypus Bank", accounts };
  },
});
