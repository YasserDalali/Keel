import { DomainError } from "../../../shared/errors";

// Ubiquitous language of failures in lending. Each has a stable `code` the interface layer maps to a response.
export class InvalidLoanTerms extends DomainError {
  constructor() { super("invalid_terms", "amount and termMonths must be positive"); }
}
export class LoanNotFound extends DomainError {
  constructor() { super("loan_not_found", "Loan not found"); }
}
export class LoanNotPending extends DomainError {
  constructor() { super("loan_not_pending", "Pending loan not found"); }
}
export class DepositUnpaid extends DomainError {
  constructor() { super("deposit_unpaid", "Upfront deposit required before approval"); }
}
export class DepositNotDue extends DomainError {
  constructor() { super("deposit_not_due", "There's no unpaid deposit on this loan"); }
}
export class CancellationRefused extends DomainError {
  constructor(readonly reason: "not_pending" | "deposit_paid") {
    super(
      reason === "not_pending" ? "cancel_not_pending" : "cancel_deposit_paid",
      reason === "not_pending"
        ? "Only loans waiting for approval can be cancelled"
        : "The deposit is already paid, so this loan can't be cancelled here. Contact Keel to cancel it.",
    );
  }
}
export class InstallmentNotFound extends DomainError {
  constructor() { super("installment_not_found", "Installment not found"); }
}
export class InvalidPaymentAmount extends DomainError {
  constructor() { super("invalid_amount", "amount must be a positive number"); }
}
/** The stored loan changed between loading and saving it (a racing request won). */
export class ConcurrentModification extends DomainError {
  constructor() { super("concurrent_modification", "Loan no longer pending"); }
}
export class ApplicationRejected extends DomainError {
  constructor(code: "email_unverified" | "identity_unverified" | "bank_required" | "risk_too_high", message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}
