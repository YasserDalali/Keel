import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";

const kyc = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Creates a Didit verification session for the authenticated user.
// Frontend passes the returned verification_url to the Didit JS SDK.
kyc.post("/session", requireAuth, async (c) => {
  const userId = c.var.userId;

  const res = await fetch("https://verification.didit.me/v3/session/", {
    method: "POST",
    headers: {
      "x-api-key": c.env.DIDIT_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: c.env.DIDIT_WORKFLOW_ID,
      vendor_data: userId,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return c.json({ error: `Didit session creation failed: ${err}` }, 502);
  }

  const data = await res.json<{
    session_id: string;
    session_token: string;
    verification_url: string;
    status: string;
  }>();

  return c.json({
    sessionId: data.session_id,
    sessionToken: data.session_token,
    verificationUrl: data.verification_url,
  });
});

export default kyc;
