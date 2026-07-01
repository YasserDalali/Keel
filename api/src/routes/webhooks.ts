import { Hono } from "hono";
import { canonicalWebhookBody, verifyWebhookSignatureV2 } from "../didit/webhook-signature";
import { upsertVerificationStatus } from "../profiles";
import type { ProfileRecord } from "../profiles";
import type { Bindings, Variables } from "../types";

type DiditStatus = string;

function toKycStatus(diditStatus: DiditStatus): ProfileRecord["kycStatus"] | null {
  switch (diditStatus) {
    case "Approved":
      return "approved";
    case "Declined":
      return "declined";
    case "In Review":
      return "in_review";
    case "In Progress":
      return "in_progress";
    case "Awaiting User":
      return "in_progress";
    case "Not Started":
      return "pending";
    case "Abandoned":
      return "abandoned";
    case "Expired":
    case "Kyc Expired":
      return "expired";
    case "Resubmitted":
      return "resubmitted";
    default:
      return null;
  }
}

const webhooks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

webhooks.post("/didit", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-signature-v2") ?? "";
  const ts = Number(c.req.header("x-timestamp"));

  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return new Response("stale", { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const canonical = canonicalWebhookBody(parsed);
  const valid = await verifyWebhookSignatureV2(c.env.DIDIT_WEBHOOK_SECRET, canonical, sig);
  if (!valid) {
    return new Response("bad sig", { status: 401 });
  }

  const eventId = parsed.event_id as string | undefined;
  if (eventId) {
    const idempotencyKey = `didit:event:${eventId}`;
    if (await c.env.LOAN_CACHE.get(idempotencyKey)) {
      return new Response("ok");
    }
    await c.env.LOAN_CACHE.put(idempotencyKey, "1", { expirationTtl: 86400 });
  }

  const sessionId = parsed.session_id as string | undefined;
  const status = parsed.status as DiditStatus | undefined;
  const webhookType = parsed.webhook_type as string | undefined;
  const userId = parsed.vendor_data as string | undefined;

  if (webhookType === "status.updated" && userId && sessionId && status) {
    const kycStatus = toKycStatus(status);
    if (kycStatus) {
      await upsertVerificationStatus(c.env.DB, userId, kycStatus, sessionId);
    }
  }

  return new Response("ok");
});

export default webhooks;
