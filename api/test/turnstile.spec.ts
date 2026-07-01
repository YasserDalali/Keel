import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../src/middleware/turnstile";

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
/** Cloudflare published always-fail test secret (not app config). */
const ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000000AA";

describe("verifyTurnstile", () => {
  it("returns true for the configured TURNSTILE_SECRET from .env", async () => {
    await expect(verifyTurnstile(DUMMY_TOKEN, env.TURNSTILE_SECRET)).resolves.toBe(true);
  });

  it("returns false for Cloudflare's always-fail test secret", async () => {
    await expect(verifyTurnstile(DUMMY_TOKEN, ALWAYS_FAIL_SECRET)).resolves.toBe(false);
  });
});
