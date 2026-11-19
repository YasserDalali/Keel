import { fromSqlTimestamp, toSqlTimestamp } from "../../../shared/clock";
import { Email } from "../domain/email";
import type { UserRepository } from "../domain/repositories";
import { User, type Role } from "../domain/user";

type Row = { id: string; email: string; password_hash: string; role: Role; email_verified_at: string | null };
const COLUMNS = "id, email, password_hash, role, email_verified_at";

export class D1UserRepository implements UserRepository {
  /** Users loaded from here, so save() knows whether to insert or update. */
  private readonly loaded = new WeakSet<User>();

  constructor(private readonly db: D1Database) {}

  byId(id: string) { return this.find("id = ?", id); }
  byEmail(email: Email) { return this.find("email = ?", email.value); }

  async save(user: User): Promise<void> {
    const verified = user.emailVerifiedAt ? toSqlTimestamp(user.emailVerifiedAt) : null;
    if (this.loaded.has(user)) {
      await this.db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").bind(verified, user.id).run();
      return;
    }
    await this.db
      .prepare("INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, user.email.value, user.passwordHash, user.role, verified)
      .run();
    this.loaded.add(user);
  }

  private async find(where: string, value: string): Promise<User | null> {
    const row = await this.db.prepare(`SELECT ${COLUMNS} FROM users WHERE ${where}`).bind(value).first<Row>();
    if (!row) return null;
    const user = User.restore({
      id: row.id, email: Email.of(row.email), passwordHash: row.password_hash, role: row.role,
      emailVerifiedAt: row.email_verified_at ? fromSqlTimestamp(row.email_verified_at) : null,
    });
    this.loaded.add(user);
    return user;
  }
}
