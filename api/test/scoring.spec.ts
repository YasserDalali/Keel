import { describe, expect, it } from "vitest";
import { bankSafetyScore, behaviorScore, finalScore, THRESHOLD } from "../src/plaid/scoring";
import type { PlaidAccount } from "../src/plaid/client";

function acct(type: string, available: number | null): PlaidAccount {
  return { name: "x", type, subtype: null, balances: { available, current: available } };
}

describe("bankSafetyScore", () => {
  it("rewards high liquid depository balance", () => {
    // baseline 50 + 30 (>=10000) + 10 (has depository) = 90
    expect(bankSafetyScore([acct("depository", 15000)])).toBe(90);
  });

  it("ignores non-depository balances for liquidity", () => {
    // investment doesn't count: 50 - 15 (liquid 0 < 500) + 0 (no depository) = 35
    expect(bankSafetyScore([acct("investment", 50000)])).toBe(35);
  });

  it("penalizes an overdrawn depository account", () => {
    // 50 - 15 (liquid -200 < 500) - 20 (overdrawn) + 10 (has depository) = 25
    expect(bankSafetyScore([acct("depository", -200)])).toBe(25);
  });

  it("clamps to [0,100]", () => {
    expect(bankSafetyScore([])).toBeGreaterThanOrEqual(0);
    expect(bankSafetyScore([acct("depository", 1e9)])).toBeLessThanOrEqual(100);
  });
});

describe("behaviorScore", () => {
  it("gives a clean approved user a high score", () => {
    expect(
      behaviorScore({ kycStatus: "approved", fullyPaidCount: 0, defaultedCount: 0, overdueInstallmentCount: 0 })
    ).toBe(85);
  });

  it("returns 0 when KYC is rejected", () => {
    expect(
      behaviorScore({ kycStatus: "rejected", fullyPaidCount: 5, defaultedCount: 0, overdueInstallmentCount: 0 })
    ).toBe(0);
  });

  it("rewards repayment history up to a cap and punishes defaults", () => {
    // 70 + 15 + min(25,20) - 30 = 75
    expect(
      behaviorScore({ kycStatus: "approved", fullyPaidCount: 5, defaultedCount: 1, overdueInstallmentCount: 0 })
    ).toBe(75);
  });
});

describe("finalScore", () => {
  it("blends 60/40 and rounds", () => {
    expect(finalScore(90, 85)).toBe(88);
  });

  it("THRESHOLD is 50", () => {
    expect(THRESHOLD).toBe(50);
  });
});
