import type { Services } from "./app/container";
import type { BindingKey } from "./env/binding-keys";

export type Bindings = Record<BindingKey, string> & {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  DOCS_BUCKET: R2Bucket;
  ASSETS: Fetcher; // static frontend (wrangler [assets])
  /** "true" enables /api/demo shortcuts. Local only. */
  DEMO_MODE?: string;
  /** Public origin of the app, for links in emails and OAuth redirects (e.g. http://localhost:5173). */
  APP_URL?: string;
  /** Resend API key (secret). When absent, emails are only recorded in email_outbox ("logged"). */
  RESEND_API_KEY?: string;
  /** Sender, e.g. "Keel <hello@yourdomain.com>"; must be on a domain verified in Resend. */
  MAIL_FROM?: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
  /** Use cases, built once per environment by the composition root (app/container.ts). */
  services: Services;
};
