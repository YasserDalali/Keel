import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError } from "../shared/errors";

/** How each business failure is reported over HTTP. The domain never sees status codes; this is the only mapping. */
const STATUS: Record<string, ContentfulStatusCode> = {
  invalid_terms: 400, invalid_amount: 400,
  email_unverified: 403, identity_unverified: 403, risk_too_high: 403,
  loan_not_found: 404, loan_not_pending: 404, installment_not_found: 404,
  deposit_unpaid: 402,
  bank_required: 428,
  deposit_not_due: 409, cancel_not_pending: 409, cancel_deposit_paid: 409, concurrent_modification: 409,
};

/**
 * Turns a DomainError into `{ error, ...details }` with its status. Anything else is a bug and is rethrown.
 * `messages` lets one route word a failure differently from the domain's default.
 */
export function problem(c: Context, e: unknown, messages: Record<string, string> = {}) {
  if (!(e instanceof DomainError)) throw e;
  return c.json({ error: messages[e.code] ?? e.message, ...e.details }, STATUS[e.code] ?? 400);
}
