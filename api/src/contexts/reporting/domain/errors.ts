import { DomainError } from "../../../shared/errors";

/** A report request the borrower can fix: bad filter, bad settings. The interface answers 400. */
export class InvalidReportRequest extends DomainError {
  constructor(message: string) { super("invalid_report_request", message); }
}
