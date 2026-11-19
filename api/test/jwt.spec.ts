import { describe, expect, it, vi } from "vitest";
import { signJwt, verifyJwt } from "../src/contexts/identity/infrastructure/jwt";

describe("jwt sign and verify", () => {
  it("round-trips a valid token", async () => {
    const token = await signJwt({ sub: "user-123", role: "borrower" }, "test-secret", 3600);
    const payload = await verifyJwt(token, "test-secret");

    expect(payload.sub).toBe("user-123");
    expect(payload.role).toBe("borrower");
    expect(typeof payload.jti).toBe("string");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signJwt({ sub: "user-123", role: "borrower" }, "secret-a", 3600);
    await expect(verifyJwt(token, "secret-b")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const token = await signJwt({ sub: "user-123", role: "borrower" }, "test-secret", 1);
    vi.advanceTimersByTime(2000);
    await expect(verifyJwt(token, "test-secret")).rejects.toThrow("Token expired");
    vi.useRealTimers();
  });
});
