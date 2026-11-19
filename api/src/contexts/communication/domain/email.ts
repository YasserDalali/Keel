/** Every kind of email Keel sends, with the data its template needs. */
export type MailTemplate =
  | "verify_email" // data: { link }
  | "loan_received" // data: { loanId, amount, termMonths }
  | "loan_approved" // data: { loanId, amount, monthly, firstDueDate }
  | "loan_declined" // data: { loanId, amount }
  | "deposit_received" // data: { loanId, amount }
  | "payment_receipt" // data: { loanId, number, count, amount, remaining }
  | "payment_reminder"; // data: { loanId, number, amount, dueDate, daysUntil }

export type EmailStatus = "sent" | "logged" | "failed";
export type OutgoingEmail = { to: string; subject: string; html: string; text: string };
export type DeliveryResult = { status: EmailStatus; error: string | null };

/** Hands an email to a delivery service. Never throws: a failure is a `failed` result. "logged" means no service is configured. */
export interface EmailSender {
  deliver(email: OutgoingEmail): Promise<DeliveryResult>;
}

/** The record of every email the platform produced and what became of it. */
export type OutboxEntry = { id: string; template: string; subject: string; html: string; createdAt: string };

export interface EmailOutbox {
  record(entry: OutgoingEmail & { userId: string | null; template: MailTemplate } & DeliveryResult): Promise<void>;
  /** What was sent (or would have been, with no provider configured) to one user, newest first. */
  recentFor(userId: string, limit: number): Promise<OutboxEntry[]>;
}

/** Looks up where to send a user's mail, without lending or anyone else knowing how users are stored. */
export interface EmailAddressBook {
  addressOf(userId: string): Promise<string | null>;
}
