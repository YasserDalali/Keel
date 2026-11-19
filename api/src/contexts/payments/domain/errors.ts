import { DomainError } from "../../../shared/errors";

// Ubiquitous language of payment failures. `code` is stable; the interface layer maps it to a status.
export class ProviderNotConfigured extends DomainError {
  constructor(providerName: string) { super("payment_provider_not_configured", `${providerName} is not configured`); }
}
export class InvalidPaymentRequest extends DomainError {
  constructor(message: string) { super("invalid_payment_request", message); }
}
export class DepositNotRequired extends DomainError {
  constructor() { super("deposit_not_required", "No upfront required for this loan"); }
}
export class DepositAlreadyPaid extends DomainError {
  constructor() { super("deposit_already_paid", "Upfront already paid"); }
}
export class InstallmentAlreadyPaid extends DomainError {
  constructor() { super("installment_already_paid", "This payment is already made"); }
}
export class AmountBelowMinimum extends DomainError {
  constructor(what: string, providerName: string, minimum: string) { super("amount_too_small", `${what} is below ${providerName} minimum (${minimum})`); }
}
/** The provider says the money did not (yet) arrive. */
export class PaymentNotCompleted extends DomainError {
  constructor(message: string) { super("payment_not_completed", message); }
}
/** The provider's payment was made for something else (another loan, installment or user). */
export class PaymentMismatch extends DomainError {
  constructor(message: string) { super("payment_mismatch", message); }
}
/** The provider could not be reached or refused the request. The message is safe to show. */
export class PaymentProviderFailed extends DomainError {
  constructor(message: string) { super("payment_provider_failed", message); }
}
