import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";

const kyc = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type DiditSessionResponse = {
  session_id: string;
  session_token: string;
  url: string;
  status: string;
};

kyc.post("/session", requireAuth, async (c) => {
  const userId = c.var.userId;

  const res = await fetch(c.env.DIDIT_SESSION_CREATE_URL, {
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
    const detail = await res.text();
    return c.json({ error: "session_create_failed", detail }, 502);
  }

  const session = (await res.json()) as DiditSessionResponse;

  return c.json({
    url: session.url,
    session_id: session.session_id,
  });
});

export default kyc;
