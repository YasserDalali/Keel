import type { AccountBalance } from "../domain/bank-safety";
import type { KycStatus } from "../domain/profile";

/** Anti-corruption layer towards the identity-check provider (Didit): its statuses, endpoints and signatures stop here. */
export type VerificationWebhook =
  | { kind: "stale" }
  | { kind: "invalid_json" }
  | { kind: "bad_signature" }
  | { kind: "event"; eventId?: string; type?: string; userId?: string; sessionId?: string; status: KycStatus | null };

export interface VerificationProvider {
  /** Opens a session the borrower completes in the provider's own UI. Throws VerificationSessionFailed. */
  openSession(userId: string): Promise<{ url: string; sessionId: string; status: KycStatus | null }>;
  /** Asks the provider how a session ended up (null when it reports something we don't recognise). Throws VerificationUnreachable-style errors via the caller. */
  decisionOf(sessionId: string): Promise<{ status: KycStatus | null } | null>;
  readWebhook(rawBody: string, signature: string, timestampHeader: string | undefined): Promise<VerificationWebhook>;
}
/** True the first time an event id is seen. Providers resend; handling twice must be harmless. */
export interface EventDeduplicator {
  firstTime(eventId: string): Promise<boolean>;
}

/** Anti-corruption layer towards the bank-link provider (Plaid). */
export interface BankLinkProvider {
  /** Throws on failure; the message is shown to the borrower. */
  createLinkToken(userId: string): Promise<string>;
  /** Trades the one-time token from the borrower's bank login for access and the current balances. */
  connect(publicToken: string): Promise<{ itemId: string; accessToken: string; institutionName: string; accounts: AccountBalance[] }>;
}
