export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  DOCS_BUCKET: R2Bucket;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  PII_ENCRYPTION_KEY: string;
  DIDIT_WEBHOOK_SECRET: string;
  DIDIT_API_KEY: string;
  DIDIT_WORKFLOW_ID: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
