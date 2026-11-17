/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwind()],
  envDir: "..", // repo-root .env, shared with wrangler
  // KEEL_API_URL (shell or .env) points the dev proxy at another worker, e.g. when 8787 is taken
  server: { proxy: { "/api": loadEnv(mode, "..", "KEEL_").KEEL_API_URL || "http://localhost:8787" } },
  test: { environment: "node" },
}));
