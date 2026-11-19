import { describe, expect, it } from "vitest";
import { completeness, isDemoBank, maskId, stepFrom, type ProfileView } from "./profile";

const base: ProfileView = { profile: null, kycStatus: null, bankConnected: false };
const details = { firstName: "A", lastName: "B", phone: "1", address: "x", nationalIdNumber: "NG-123456789", kycStatus: "approved" };

describe("maskId", () => {
  it("keeps only the last four characters", () => {
    expect(maskId("NG-123456789")).toBe("•••• 6789");
  });
  it("hides short or missing IDs entirely", () => {
    expect(maskId("123")).toBe("••••");
    expect(maskId(null)).toBe("—");
  });
});

describe("completeness", () => {
  it("counts the three parts and points at the first missing step", () => {
    const c = completeness({ ...base, profile: details, bankConnected: true });
    expect(c).toMatchObject({ done: 2, total: 3, next: "identity" });
  });
  it("has no next step when everything is done", () => {
    expect(completeness({ ...base, profile: details, bankConnected: true, kycStatus: "approved" }).next).toBeNull();
  });
});

describe("stepFrom", () => {
  it("honours a valid ?step=", () => {
    expect(stepFrom("bank", base)).toBe("bank");
    expect(stepFrom("review", base)).toBe("review");
  });
  it("falls back to the first unfinished step, then review", () => {
    expect(stepFrom(null, base)).toBe("profile");
    expect(stepFrom("nonsense", { ...base, profile: details })).toBe("bank");
    expect(stepFrom(null, { ...base, profile: details, bankConnected: true, kycStatus: "approved" })).toBe("review");
  });
});

describe("isDemoBank", () => {
  it("recognises the demo shortcut's bank", () => {
    expect(isDemoBank({ ...base, bank: { institutionName: "Demo Bank", safetyScore: 80, connectedAt: null } })).toBe(true);
    expect(isDemoBank({ ...base, bank: null })).toBe(false);
  });
});
