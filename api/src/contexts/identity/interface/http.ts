import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError } from "../../../shared/errors";

// How identity's failures are reported over HTTP.
const STATUS: Record<string, ContentfulStatusCode> = {
  invalid_email: 400, verification_link_invalid: 400, verification_link_expired: 400,
  invalid_credentials: 401,
  user_not_found: 404,
  email_taken: 409,
  verification_throttled: 429,
};

export function reply(c: Context, e: unknown) {
  if (!(e instanceof DomainError)) throw e;
  return c.json({ error: e.message, ...e.details }, STATUS[e.code] ?? 400);
}
