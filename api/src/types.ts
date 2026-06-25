export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  KYC_BUCKET: R2Bucket;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  PII_ENCRYPTION_KEY: string;
  GEMINI_API_KEY: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
