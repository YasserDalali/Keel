export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  KYC_BUCKET: R2Bucket;
  AI: Ai;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
