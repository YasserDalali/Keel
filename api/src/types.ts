import type { BindingKey } from "./env/binding-keys";

export type Bindings = Record<BindingKey, string> & {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  DOCS_BUCKET: R2Bucket;
  /** "true" enables /api/demo shortcuts. Local only. */
  DEMO_MODE?: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
