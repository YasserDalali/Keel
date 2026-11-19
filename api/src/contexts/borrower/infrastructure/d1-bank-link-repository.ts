import { decryptField, encryptField } from "../../../shared/crypto";
import { BankLink } from "../domain/bank-link";
import type { BankLinkRepository, BankLinkSummary } from "../domain/repositories";

export class D1BankLinkRepository implements BankLinkRepository {
  constructor(private readonly db: D1Database, private readonly encryptionKey: string) {}

  async byUserId(userId: string): Promise<BankLink | null> {
    const row = await this.db
      .prepare("SELECT user_id, item_id, access_token, institution_name, bank_safety_score, bank_signals FROM plaid_items WHERE user_id = ?")
      .bind(userId)
      .first<{ user_id: string; item_id: string; access_token: string; institution_name: string | null; bank_safety_score: number; bank_signals: string }>();
    if (!row) return null;
    return BankLink.record({
      userId: row.user_id, itemId: row.item_id, accessToken: await decryptField(row.access_token, this.encryptionKey),
      institutionName: row.institution_name, safetyScore: row.bank_safety_score, signals: row.bank_signals,
    });
  }

  /** Display fields only: no decryption, no secrets. */
  async summaryOf(userId: string): Promise<BankLinkSummary | null> {
    const row = await this.db
      .prepare("SELECT institution_name, bank_safety_score, COALESCE(updated_at, created_at) AS connected_at FROM plaid_items WHERE user_id = ?")
      .bind(userId)
      .first<{ institution_name: string | null; bank_safety_score: number; connected_at: string | null }>();
    return row ? { institutionName: row.institution_name, safetyScore: row.bank_safety_score, connectedAt: row.connected_at } : null;
  }

  async save(link: BankLink): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO plaid_items (user_id, item_id, access_token, institution_name, bank_safety_score, bank_signals)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           item_id = excluded.item_id, access_token = excluded.access_token, institution_name = excluded.institution_name,
           bank_safety_score = excluded.bank_safety_score, bank_signals = excluded.bank_signals, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(link.userId, link.itemId, await encryptField(link.accessToken, this.encryptionKey), link.institutionName, link.safetyScore, link.signals)
      .run();
  }
}
