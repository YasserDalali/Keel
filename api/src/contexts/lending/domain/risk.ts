/** The lender's view of an applicant's reliability, combining the bank's safety score with their track record. */
export const WEIGHTS = { bank: 0.6, behavior: 0.4 } as const;

export type BorrowingRecord = {
  /** Identity verification state, as reported by the borrower context. */
  kycStatus: "pending" | "approved" | "rejected" | string;
  fullyPaidLoans: number;
  /** Approved loans that defaulted. Declined and cancelled applications do not count. */
  defaultedLoans: number;
  overdueInstallments: number;
};

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export function behaviorScore(r: BorrowingRecord): number {
  if (r.kycStatus === "rejected") return 0;
  let score = 70;
  if (r.kycStatus === "approved") score += 15;
  score += Math.min(r.fullyPaidLoans * 5, 20);
  score -= r.defaultedLoans * 30;
  score -= r.overdueInstallments * 10;
  return clamp(score);
}

export function finalScore(bankSafety: number, behavior: number): number {
  return Math.round(WEIGHTS.bank * bankSafety + WEIGHTS.behavior * behavior);
}

export class RiskAssessment {
  private constructor(
    readonly finalScore: number,
    readonly bankSafety: number,
    readonly behavior: number,
    readonly threshold: number,
  ) {}

  static restore(p: { finalScore: number; bankSafety: number; behavior: number; threshold: number }): RiskAssessment {
    return new RiskAssessment(p.finalScore, p.bankSafety, p.behavior, p.threshold);
  }

  get acceptable(): boolean { return this.finalScore >= this.threshold; }

  /** The stored explanation officers read on the review screen. */
  summary() {
    return { finalScore: this.finalScore, bankSafety: this.bankSafety, behavior: this.behavior, weights: WEIGHTS, threshold: this.threshold };
  }
}

/** Domain service: turns a bank safety score and a borrowing record into an assessment against the lender's threshold. */
export class RiskPolicy {
  constructor(readonly threshold: number) {}

  assess(bankSafety: number, record: BorrowingRecord): RiskAssessment {
    const behavior = behaviorScore(record);
    return RiskAssessment.restore({ finalScore: finalScore(bankSafety, behavior), bankSafety, behavior, threshold: this.threshold });
  }
}
