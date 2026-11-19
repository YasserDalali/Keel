import type { DomainEvent } from "../../../shared/events";

// Facts raised by identity that other contexts react to (documents: account-opened PDF; communication: verification email).
export type UserRegistered = DomainEvent & { type: "identity.user-registered"; userId: string; email: string; documentId: string };
/** Raised at sign-up and again whenever the user asks for a new verification link. */
export type VerificationRequested = DomainEvent & { type: "identity.verification-requested"; userId: string; email: string; link: string };
export type IdentityEvent = UserRegistered | VerificationRequested;
