import type { PlaidAccount } from "./client";

export const WEIGHTS = { bank: 0.6, behavior: 0.4 } as const;

export type BehaviorHistory = {
  kycStatus: "pending" | "approved" | "rejected";
  fullyPaidCount: number;
  defaultedCount: number;
  overdueInstallmentCount: number;
};

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export function bankSafetyScore(accounts: PlaidAccount[]): number {
  const depository = accounts.filter((a) => a.type === "depository");
  const liquid = depository.reduce((sum, a) => sum + (a.balances.available ?? 0), 0);

  let score = 50;
  if (liquid >= 10000) score += 30;
  else if (liquid >= 2000) score += 15;
  else if (liquid < 500) score -= 15;

  if (depository.some((a) => (a.balances.available ?? 0) < 0)) score -= 20;
  if (depository.length > 0) score += 10;

  return clamp(score);
}

export function behaviorScore(history: BehaviorHistory): number {
  if (history.kycStatus === "rejected") return 0;

  let score = 70;
  if (history.kycStatus === "approved") score += 15;
  score += Math.min(history.fullyPaidCount * 5, 20);
  score -= history.defaultedCount * 30;
  score -= history.overdueInstallmentCount * 10;

  return clamp(score);
}

export function finalScore(bankSafety: number, behavior: number): number {
  return Math.round(WEIGHTS.bank * bankSafety + WEIGHTS.behavior * behavior);
}
