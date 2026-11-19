import type { NotificationEntry, NotificationRepository, Note, StaffDirectory } from "../domain/notification";
import type { EmailAddressBook } from "../domain/email";

export class D1NotificationRepository implements NotificationRepository {
  constructor(private readonly db: D1Database) {}

  async add(userIds: readonly string[], note: Note): Promise<void> {
    const insert = (userId: string) =>
      this.db
        .prepare("INSERT INTO notifications (id, user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), userId, note.kind, note.title, note.body, note.link ?? null);
    if (userIds.length === 1) await insert(userIds[0]).run();
    else await this.db.batch(userIds.map(insert));
  }

  async inbox(userId: string, limit: number): Promise<NotificationEntry[]> {
    const { results } = await this.db
      .prepare("SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .bind(userId, limit)
      .all<{ id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }>();
    return results.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, readAt: r.read_at, createdAt: r.created_at }));
  }

  async unreadCount(userId: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(userId).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async markRead(userId: string, ids?: readonly string[]): Promise<void> {
    if (ids === undefined) {
      await this.db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL").bind(userId).run();
      return;
    }
    await this.db
      .prepare(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`)
      .bind(userId, ...ids)
      .run();
  }
}

// ponytail: both directories read the users table directly; they become calls to the identity context when it is extracted.
export class D1StaffDirectory implements StaffDirectory {
  constructor(private readonly db: D1Database) {}
  async staffIds(): Promise<string[]> {
    const { results } = await this.db.prepare("SELECT id FROM users WHERE role IN ('officer', 'admin')").all<{ id: string }>();
    return results.map((r) => r.id);
  }
}

export class D1EmailAddressBook implements EmailAddressBook {
  constructor(private readonly db: D1Database) {}
  async addressOf(userId: string): Promise<string | null> {
    const u = await this.db.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first<{ email: string }>();
    return u?.email ?? null;
  }
}
