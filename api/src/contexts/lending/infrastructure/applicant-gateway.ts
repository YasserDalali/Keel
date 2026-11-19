import type { Applicant, ApplicantGateway } from "../application/ports";

/** The two questions lending asks other contexts, as plain functions. The composition root answers them from identity and borrower. */
export type ApplicantSources = {
  emailVerified(userId: string): Promise<boolean>;
  standing(userId: string): Promise<{ kycStatus: string; bankSafetyScore: number | null }>;
};

/**
 * Lending's view of an applicant. It knows nothing about how users, profiles or bank links are stored, or even which
 * contexts hold them: `app/wiring/lending.ts` connects it to identity and borrower.
 */
export class CompositeApplicantGateway implements ApplicantGateway {
  constructor(private readonly sources: ApplicantSources) {}

  async describe(borrowerId: string): Promise<Applicant> {
    const [emailVerified, standing] = await Promise.all([this.sources.emailVerified(borrowerId), this.sources.standing(borrowerId)]);
    return { emailVerified, kycStatus: standing.kycStatus, bankSafetyScore: standing.bankSafetyScore };
  }
}
