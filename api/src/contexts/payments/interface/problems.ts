import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { problem } from "../../../app/http";
import { DomainError } from "../../../shared/errors";

/** How payment failures are reported over HTTP. Lending's codes (not found, conflicts...) are handled by app/http. */
const STATUS: Record<string, ContentfulStatusCode> = {
  invalid_payment_request: 400,
  deposit_not_required: 400,
  amount_too_small: 400,
  payment_not_completed: 402,
  payment_mismatch: 403,
  deposit_already_paid: 409,
  installment_already_paid: 409,
  payment_provider_failed: 502,
  payment_provider_not_configured: 503,
};

export function fail(c: Context, e: unknown, messages: Record<string, string> = {}) {
  if (e instanceof DomainError && STATUS[e.code]) {
    if (e.code === "payment_provider_failed") console.error(`[payments] ${c.req.method} ${c.req.path}:`, e.message);
    return c.json({ error: messages[e.code] ?? e.message, ...e.details }, STATUS[e.code]);
  }
  return problem(c, e, messages);
}
