import { applyD1Migrations, env } from "cloudflare:test";

// required one-time setup so D1-backed tests see the real schema; vitest-pool-workers
// doesn't apply migrations automatically.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
