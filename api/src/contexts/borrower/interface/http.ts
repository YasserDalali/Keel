import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError } from "../../../shared/errors";

// How the borrower context's failures are reported over HTTP.
const STATUS: Record<string, ContentfulStatusCode> = {
  details_incomplete: 400,
  profile_not_found: 404,
  session_create_failed: 502, verification_unreachable: 502, bank_link_token_failed: 502, bank_connect_failed: 502,
};

export function reply(c: Context, e: unknown) {
  if (!(e instanceof DomainError)) throw e;
  return c.json({ error: e.message, ...e.details }, STATUS[e.code] ?? 400);
}
