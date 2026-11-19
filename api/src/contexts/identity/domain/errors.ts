import { DomainError } from "../../../shared/errors";

// Failures in the language of identity. Each has a stable `code` the interface maps to a response.
export class InvalidEmail extends DomainError {
  constructor() { super("invalid_email", "A valid email address is required"); }
}
export class EmailTaken extends DomainError {
  constructor() { super("email_taken", "Email already registered"); }
}
export class InvalidCredentials extends DomainError {
  constructor() { super("invalid_credentials", "Invalid credentials"); }
}
export class UserNotFound extends DomainError {
  constructor() { super("user_not_found", "User not found"); }
}
export class VerificationLinkInvalid extends DomainError {
  constructor() { super("verification_link_invalid", "This link isn't valid."); }
}
export class VerificationLinkExpired extends DomainError {
  constructor() { super("verification_link_expired", "This link has expired or was already used. Ask for a new one."); }
}
export class VerificationThrottled extends DomainError {
  constructor() { super("verification_throttled", "We just sent one. Wait a minute before asking again."); }
}
