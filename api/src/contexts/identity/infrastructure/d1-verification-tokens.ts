import { toSqlTimestamp } from "../../../shared/clock";
import type { VerificationTokenRepository } from "../domain/repositories";
import type { VerificationToken } from "../domain/verification-token";

export class D1VerificationTokens implements VerificationTokenRepository {
  constructor(private readonly db: D1Database) {}

  async add(t: VerificationToken): Promise<void> {
    await this.db
      .prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'verify_email', ?)")
      .bind(t.hash, t.userId, toSqlTimestamp(t.expiresAt))
      .run();
  }

  async consume(hash: string, now: Date): Promise<string | null> {
    // One statement: only an unused, unexpired token matches, and using it is the same step as finding it.
    const row = await this.db
      .prepare(
        `UPDATE email_tokens SET used_at = CURRENT_TIMESTAMP
          WHERE token_hash = ? AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > ?
          RETURNING user_id`,
      )
      .bind(hash, toSqlTimestamp(now))
      .first<{ user_id: string }>();
    return row?.user_id ?? null;
  }
}
