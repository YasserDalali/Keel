import type { EmailOutbox } from "../domain/email";
import { InvalidNotificationIds, type NotificationRepository } from "../domain/notification";

export class ReadOutbox {
  constructor(private outbox: EmailOutbox) {}
  execute(userId: string) {
    return this.outbox.recentFor(userId, 20);
  }
}

export class GetInbox {
  constructor(private notifications: NotificationRepository) {}

  async execute(userId: string) {
    const [notifications, unread] = await Promise.all([this.notifications.inbox(userId, 50), this.notifications.unreadCount(userId)]);
    return { notifications, unread };
  }
}

export class MarkNotificationsRead {
  constructor(private notifications: NotificationRepository) {}

  /** `ids` omitted means everything. Only ever touches the caller's own notifications. */
  async execute(userId: string, ids?: unknown): Promise<void> {
    if (ids === undefined) return this.notifications.markRead(userId);
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => typeof id === "string")) throw new InvalidNotificationIds();
    if (ids.length) await this.notifications.markRead(userId, ids as string[]);
  }
}
