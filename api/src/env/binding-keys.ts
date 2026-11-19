/** Worker secret/var binding names — values come from repo-root `.env` (local) or Wrangler secrets (prod). */
export const BINDING_KEYS = [
  "JWT_SECRET",
  "TURNSTILE_SECRET",
  "PII_ENCRYPTION_KEY",
  "DIDIT_API_KEY",
  "DIDIT_WORKFLOW_ID",
  "DIDIT_WEBHOOK_SECRET",
  "DIDIT_SESSION_CREATE_URL",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_BASE_URL",
  "PLAID_SANDBOX_INSTITUTION",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_SECRET",
  "LOAN_FLAT_INTEREST_RATE",
  "LOAN_UPFRONT_THRESHOLD",
  "LOAN_UPFRONT_PCT",
  "RISK_SCORE_THRESHOLD",
  "APP_URL",
] as const;

/** Keys that may be left blank when an integration is not configured yet. */
export const OPTIONAL_BINDING_KEYS = new Set<BindingKey>([
  "PAYPAL_CLIENT_ID",
  "PAYPAL_SECRET",
  "APP_URL",
]);

export type BindingKey = (typeof BINDING_KEYS)[number];
