import type { Email } from "./email";

export type Role = "borrower" | "officer" | "admin";

export type UserState = {
  id: string;
  email: Email;
  /** Opaque, produced by a PasswordHasher. The domain never sees the password itself. */
  passwordHash: string;
  role: Role;
  emailVerifiedAt: Date | null;
};

/**
 * Aggregate root: someone who can sign in. Roles are fixed at creation here (staff accounts are provisioned
 * outside the app); everyone who registers is a borrower.
 */
export class User {
  private constructor(private state: UserState) {}

  /** Sign-up with a password: starts unverified until the emailed link is used. */
  static register(p: { id: string; email: Email; passwordHash: string }): User {
    return new User({ id: p.id, email: p.email, passwordHash: p.passwordHash, role: "borrower", emailVerifiedAt: null });
  }

  static restore(state: UserState): User {
    return new User(state);
  }

  get id(): string { return this.state.id; }
  get email(): Email { return this.state.email; }
  get passwordHash(): string { return this.state.passwordHash; }
  get role(): Role { return this.state.role; }
  get emailVerifiedAt(): Date | null { return this.state.emailVerifiedAt; }
  get emailVerified(): boolean { return this.state.emailVerifiedAt !== null; }

  /** Idempotent: the first verification time is kept. */
  verifyEmail(at: Date): void {
    this.state.emailVerifiedAt ??= at;
  }
}
