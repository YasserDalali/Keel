import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const migrationsPath = path.join(__dirname, "migrations");

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(migrationsPath);
  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "../wrangler.toml" },
          miniflare: {
            // Pin Cloudflare's always-pass Turnstile test secret so the suite stays
            // hermetic regardless of the real secret in .dev.vars (used for local dev).
            bindings: {
              TEST_MIGRATIONS: migrations,
              TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
              DIDIT_WEBHOOK_SECRET: "test-webhook-secret",
            },
          },
        },
      },
    },
  };
});
