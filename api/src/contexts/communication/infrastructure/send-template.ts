import type { Bindings } from "../../../types";
import { SendEmail } from "../application/communicator";
import type { MailTemplate } from "../domain/email";
import { D1EmailOutbox, ResendEmailSender } from "./email-adapters";

export type { MailTemplate };

/** Send one templated email from an environment. Kept for callers outside the event flow; never throws. */
export function sendTemplate(env: Bindings, userId: string | null, to: string, template: MailTemplate, data: Record<string, unknown>): Promise<void> {
  return new SendEmail(new ResendEmailSender(env.RESEND_API_KEY, env.MAIL_FROM), new D1EmailOutbox(env.DB), env.APP_URL ?? "").execute(userId, to, template, data);
}
