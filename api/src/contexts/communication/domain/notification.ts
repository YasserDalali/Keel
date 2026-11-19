import { DomainError } from "../../../shared/errors";

/** What a notification says. */
export type Note = { kind: string; title: string; body: string; link?: string | null };

/** A notification as its recipient sees it. */
export type NotificationEntry = { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

/** In-app notifications, one row per recipient so each person has their own read state. */
export interface NotificationRepository {
  add(userIds: readonly string[], note: Note): Promise<void>;
  inbox(userId: string, limit: number): Promise<NotificationEntry[]>;
  unreadCount(userId: string): Promise<number>;
  /** Marks the recipient's own unread notifications read: the given ids, or all of them when `ids` is omitted. */
  markRead(userId: string, ids?: readonly string[]): Promise<void>;
}

/** Everyone who works the review queue (officers and admins). */
export interface StaffDirectory {
  staffIds(): Promise<string[]>;
}

export class InvalidNotificationIds extends DomainError {
  constructor() {
    super("invalid_ids", "ids must be an array of up to 100 strings");
  }
}
