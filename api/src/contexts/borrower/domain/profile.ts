import { PersonalDetails, type StoredDetails } from "./personal-details";

/** Where the borrower is in the identity check. "approved" is the only state that lets someone borrow. */
export type KycStatus = "pending" | "in_progress" | "in_review" | "approved" | "declined" | "abandoned" | "expired" | "resubmitted";

/** Who reported a verification result. The provider's own notification is authoritative; a refresh is us asking. */
export type DecisionSource = "provider" | "refresh";

export type ProfileState = {
  userId: string;
  details: StoredDetails;
  kycStatus: KycStatus;
  /** The provider's id for the latest verification session. */
  verificationSessionId: string | null;
  kycUpdatedAt: Date | null;
};

const NO_DETAILS: StoredDetails = { firstName: null, lastName: null, phone: null, address: null, nationalIdNumber: null };

/**
 * Aggregate root: what we know about a borrower as a person and as a verified identity. One per user.
 * It refers to the user by id only (users belong to the identity context).
 */
export class Profile {
  private constructor(private state: ProfileState) {}

  /** A profile that exists because the borrower just filled in their details. */
  static startWithDetails(userId: string, details: PersonalDetails): Profile {
    return new Profile({ userId, details: { ...details }, kycStatus: "pending", verificationSessionId: null, kycUpdatedAt: null });
  }

  /** A profile that exists because verification began (or a provider reported on someone) before any details were saved. */
  static startWithVerification(userId: string, at: Date): Profile {
    return new Profile({ userId, details: NO_DETAILS, kycStatus: "pending", verificationSessionId: null, kycUpdatedAt: at });
  }

  static restore(state: ProfileState): Profile {
    return new Profile(state);
  }

  get userId(): string { return this.state.userId; }
  get details(): StoredDetails { return this.state.details; }
  get kycStatus(): KycStatus { return this.state.kycStatus; }
  get verificationSessionId(): string | null { return this.state.verificationSessionId; }
  get kycUpdatedAt(): Date | null { return this.state.kycUpdatedAt; }
  get identityVerified(): boolean { return this.state.kycStatus === "approved"; }

  updateDetails(details: PersonalDetails): void {
    this.state.details = { ...details };
  }

  /**
   * The provider opened a verification session. Remember it, and take its starting status,
   * except that someone already verified is never sent back by merely starting another session.
   */
  beginVerification(sessionId: string, status: KycStatus): void {
    this.state.verificationSessionId = sessionId;
    if (!this.identityVerified) this.state.kycStatus = status;
  }

  /**
   * A verification result arrived. Returns whether anything changed.
   * A refresh never overrides an approval or repeats a status we already hold; the provider's own notification always applies.
   */
  recordDecision(p: { status: KycStatus; sessionId: string | null; source: DecisionSource; at: Date }): boolean {
    if (p.source === "refresh" && (this.identityVerified || p.status === this.state.kycStatus)) return false;
    this.state.kycStatus = p.status;
    if (p.sessionId) this.state.verificationSessionId = p.sessionId;
    this.state.kycUpdatedAt = p.at;
    return true;
  }
}
