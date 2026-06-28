import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// Canonical JSON: sort object keys recursively (matches Didit X-Signature-V2)
function canonicalize(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

async function postWebhook(body: object, overrides: { sig?: string; timestamp?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ts = overrides.timestamp ?? now;
  const canonical = canonicalize(body);
  const sig = overrides.sig ?? await sign(canonical, "test-webhook-secret");

  return app.request("/api/webhooks/didit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-V2": sig,
      "X-Timestamp": String(ts),
    },
    body: JSON.stringify(body),
  }, env);
}

function makeEvent(userId: string, status: string, webhookType = "status.updated") {
  return {
    event_id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    status,
    webhook_type: webhookType,
    created_at: Math.floor(Date.now() / 1000),
    timestamp: Math.floor(Date.now() / 1000),
    application_id: "app-id",
    workflow_id: "wf-id",
    workflow_version: 1,
    vendor_data: userId,
  };
}

describe("POST /api/webhooks/didit", () => {
  it("returns 400 when signature is wrong", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "bad-sig@example.com");
    const res = await postWebhook(makeEvent(userId, "Approved"), { sig: "deadbeef" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when timestamp is stale (> 300s)", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "stale-ts@example.com");
    const staleTs = Math.floor(Date.now() / 1000) - 301;
    const res = await postWebhook(makeEvent(userId, "Approved"), { timestamp: staleTs });
    expect(res.status).toBe(400);
  });

  it("sets kycStatus=approved on Approved event", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "approved@example.com");
    const event = makeEvent(userId, "Approved");

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT kyc_status, didit_session_id FROM profiles WHERE user_id = ?")
      .bind(userId).first<{ kyc_status: string; didit_session_id: string }>();
    expect(row?.kyc_status).toBe("approved");
    expect(row?.didit_session_id).toBe(event.session_id);
  });

  it("sets kycStatus=declined on Declined event", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "declined@example.com");

    const res = await postWebhook(makeEvent(userId, "Declined"));
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
      .bind(userId).first<{ kyc_status: string }>();
    expect(row?.kyc_status).toBe("declined");
  });

  it("sets kycStatus=in_review on In Review event", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "in-review@example.com");

    const res = await postWebhook(makeEvent(userId, "In Review"));
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
      .bind(userId).first<{ kyc_status: string }>();
    expect(row?.kyc_status).toBe("in_review");
  });

  it("deduplicates events with the same event_id", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "dedup@example.com");
    const event = makeEvent(userId, "In Progress");

    const first = await postWebhook(event);
    expect(first.status).toBe(200);

    const second = await postWebhook(event); // same event_id
    expect(second.status).toBe(200); // still 2xx, just skipped
  });

  it("ignores non-status.updated webhook types gracefully", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "other-type@example.com");

    const res = await postWebhook(makeEvent(userId, "Approved", "data.updated"));
    expect(res.status).toBe(200);
  });
});
