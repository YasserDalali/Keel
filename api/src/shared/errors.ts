/**
 * A business rule was broken. Domain and application code throw these; only the interface layer
 * knows how to turn a `code` into an HTTP status. `details` carries data the response may need.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}
