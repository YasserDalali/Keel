const LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * A single-use proof of owning an email address. Only a hash of the secret is ever stored, so a leaked database
 * can't be used to verify accounts.
 */
export class VerificationToken {
  private constructor(readonly hash: string, readonly userId: string, readonly expiresAt: Date) {}

  static issue(hash: string, userId: string, at: Date): VerificationToken {
    return new VerificationToken(hash, userId, new Date(at.getTime() + LIFETIME_MS));
  }
}
