import { Communicator, SendEmail } from "../../contexts/communication/application/communicator";
import { GetInbox, MarkNotificationsRead, ReadOutbox } from "../../contexts/communication/application/inbox";
import { subscribeCommunication } from "../../contexts/communication/application/subscribers";
import { D1EmailOutbox, ResendEmailSender } from "../../contexts/communication/infrastructure/email-adapters";
import { D1EmailAddressBook, D1NotificationRepository, D1StaffDirectory } from "../../contexts/communication/infrastructure/d1-notification-repository";
import type { Wiring } from "./shared";

export function wireCommunication({ env, bus }: Wiring) {
  const notifications = new D1NotificationRepository(env.DB);
  const outbox = new D1EmailOutbox(env.DB);
  const email = new SendEmail(new ResendEmailSender(env.RESEND_API_KEY, env.MAIL_FROM), outbox, env.APP_URL ?? "");
  const communicator = new Communicator(notifications, new D1StaffDirectory(env.DB), new D1EmailAddressBook(env.DB), email);
  subscribeCommunication(bus, communicator, email);
  return { getInbox: new GetInbox(notifications), markRead: new MarkNotificationsRead(notifications), readOutbox: new ReadOutbox(outbox) };
}
