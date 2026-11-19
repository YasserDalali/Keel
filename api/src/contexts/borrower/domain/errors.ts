import { DomainError } from "../../../shared/errors";

export class DetailsIncomplete extends DomainError {
  constructor() { super("details_incomplete", "All fields are required: firstName, lastName, phone, address, nationalIdNumber"); }
}
export class ProfileNotFound extends DomainError {
  constructor() { super("profile_not_found", "Profile not found"); }
}
/** The identity-check provider refused to open a session. `detail` is its own explanation. */
export class VerificationSessionFailed extends DomainError {
  constructor(detail: string) { super("session_create_failed", "session_create_failed", { detail }); }
}
export class VerificationUnreachable extends DomainError {
  constructor(kycStatus: string | null) { super("verification_unreachable", "We couldn't reach the ID check. Try again in a moment.", { kycStatus }); }
}
export class BankLinkFailed extends DomainError {
  constructor(code: "bank_link_token_failed" | "bank_connect_failed", message: string) { super(code, message); }
}
