import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { loadRootEnvBindings } from "./test/load-root-env";

const migrationsPath = path.join(__dirname, "migrations");
const envBindings = loadRootEnvBindings();

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(migrationsPath);
  return {
    test: {
      testTimeout: 20_000, // PDF generation in the workers pool can exceed the 5 s default under full-suite load
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "../wrangler.toml" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              ...envBindings,
              RESEND_API_KEY: "", // tests never send real email, even if .dev.vars has a key
            },
          },
        },
      },
    },
  };
});
