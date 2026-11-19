import type { EmailAddressBook, EmailOutbox, EmailSender, MailTemplate } from "../domain/email";
import { render } from "../domain/email-templates";
import type { NotificationRepository, Note, StaffDirectory } from "../domain/notification";

/** Renders an email, hands it to the delivery service and records the outcome. Never throws: a failed email must not fail the request. */
export class SendEmail {
  constructor(private sender: EmailSender, private outbox: EmailOutbox, private appUrl: string) {}

  async execute(userId: string | null, to: string, template: MailTemplate, data: Record<string, unknown>): Promise<void> {
    try {
      const { subject, html, text } = render(template, data, this.appUrl);
      const result = await this.sender.deliver({ to, subject, html, text });
      await this.outbox.record({ userId, to, template, subject, html, text, ...result });
    } catch (e) {
      console.error("[mail] could not record email", template, (e as Error).message);
    }
  }
}

/**
 * Reaching people. Notifications and emails are side effects of something that already happened, so every method
 * logs and swallows its errors: the action that triggered them still succeeds.
 */
export class Communicator {
  constructor(
    private notifications: NotificationRepository,
    private staff: StaffDirectory,
    private addresses: EmailAddressBook,
    private email: SendEmail,
  ) {}

  async notifyUser(userId: string, note: Note): Promise<void> {
    try {
      await this.notifications.add([userId], note);
    } catch (e) {
      console.error("notifyUser:", note.kind, (e as Error).message);
    }
  }

  /** One notification per officer/admin, so each has their own read state. */
  async notifyStaff(note: Note): Promise<void> {
    try {
      const ids = await this.staff.staffIds();
      if (ids.length) await this.notifications.add(ids, note);
    } catch (e) {
      console.error("notifyStaff:", note.kind, (e as Error).message);
    }
  }

  async emailUser(userId: string, template: MailTemplate, data: Record<string, unknown>): Promise<void> {
    try {
      const to = await this.addresses.addressOf(userId);
      if (to) await this.email.execute(userId, to, template, data);
    } catch (e) {
      console.error("emailUser:", template, (e as Error).message);
    }
  }
}
