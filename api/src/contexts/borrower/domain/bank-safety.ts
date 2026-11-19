/** One account as the bank reports it. */
export type AccountBalance = {
  name: string;
  type: string;
  subtype: string | null;
  balances: { available: number | null; current: number | null };
};

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Domain service: how safe a borrower's bank position looks, 0-100. Rewards liquidity and an account in good standing,
 * penalises low balances and overdrafts.
 */
export function bankSafetyScore(accounts: readonly AccountBalance[]): number {
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

/** The figures kept alongside the score, for officers reviewing an application. */
export function bankSignals(accounts: readonly AccountBalance[]) {
  return {
    liquidDepository: accounts.filter((a) => a.type === "depository").reduce((s, a) => s + (a.balances.available ?? 0), 0),
    accountCount: accounts.length,
  };
}
