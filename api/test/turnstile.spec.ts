import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../src/middleware/turnstile";

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA";
const ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000000AA";

describe("verifyTurnstile", () => {
  it("returns true for Cloudflare's always-pass test secret", async () => {
    await expect(verifyTurnstile(DUMMY_TOKEN, ALWAYS_PASS_SECRET)).resolves.toBe(true);
  });

  it("returns false for Cloudflare's always-fail test secret", async () => {
    await expect(verifyTurnstile(DUMMY_TOKEN, ALWAYS_FAIL_SECRET)).resolves.toBe(false);
  });
});
