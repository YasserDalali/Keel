import { Hono } from "hono";
import { upsertVerificationStatus } from "../profiles";
import type { Bindings, Variables } from "../types";
import type { ProfileRecord } from "../profiles";

type DiditStatus = string;

// Recursively sort object keys for canonical JSON (X-Signature-V2)
function canonicalize(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}

async function verifySignature(secret: string, payload: string, sig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedHex.length !== sig.length) return false;
  // ponytail: constant-time compare to prevent timing attacks
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

function toKycStatus(diditStatus: DiditStatus): ProfileRecord["kycStatus"] | null {
  switch (diditStatus) {
    case "Approved":    return "approved";
    case "Declined":    return "declined";
    case "In Review":   return "in_review";
    case "In Progress": return "in_progress";
    case "Not Started": return "pending";
    case "Abandoned":   return "abandoned";
    case "Expired":
    case "KYC Expired": return "expired";
    case "Resubmitted": return "resubmitted";
    default:            return null;
  }
}

const webhooks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

webhooks.post("/didit", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("X-Signature-V2") ?? "";
  const ts = parseInt(c.req.header("X-Timestamp") ?? "0", 10);
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - ts) > 300) {
    return c.json({ error: "Stale timestamp" }, 400);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const valid = await verifySignature(c.env.DIDIT_WEBHOOK_SECRET, canonicalize(parsed), sig);
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const eventId = parsed.event_id as string | undefined;
  const sessionId = parsed.session_id as string | undefined;
  const status = parsed.status as DiditStatus | undefined;
  const webhookType = parsed.webhook_type as string | undefined;
  const userId = parsed.vendor_data as string | undefined;

  // Idempotency: skip already-processed events (24h TTL covers Didit's 2-retry window)
  if (eventId) {
    const idempotencyKey = `didit:event:${eventId}`;
    if (await c.env.LOAN_CACHE.get(idempotencyKey)) {
      return c.json({ ok: true, skipped: true });
    }
    await c.env.LOAN_CACHE.put(idempotencyKey, "1", { expirationTtl: 86400 });
  }

  if (webhookType === "status.updated" && userId && sessionId && status) {
    const kycStatus = toKycStatus(status);
    if (kycStatus) {
      await upsertVerificationStatus(c.env.DB, userId, kycStatus, sessionId);
    }
  }

  return c.json({ ok: true });
});

export default webhooks;
