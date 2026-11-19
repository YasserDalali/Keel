import type { BankLink } from "./bank-link";
import type { KycStatus, Profile } from "./profile";

export interface ProfileRepository {
  byUserId(userId: string): Promise<Profile | null>;
  /** Just the identity-check status, without decrypting anything. */
  kycStatusOf(userId: string): Promise<KycStatus | null>;
  save(profile: Profile): Promise<void>;
}

/** What the borrower's own screen shows about the bank link: display fields only, never the access token. */
export type BankLinkSummary = { institutionName: string | null; safetyScore: number; connectedAt: string | null };

export interface BankLinkRepository {
  byUserId(userId: string): Promise<BankLink | null>;
  summaryOf(userId: string): Promise<BankLinkSummary | null>;
  save(link: BankLink): Promise<void>;
}
