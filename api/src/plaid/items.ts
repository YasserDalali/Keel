import { encryptField, decryptField } from "../crypto";

export type PlaidItemInput = {
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string | null;
  bankSafetyScore: number;
  bankSignals: string; // JSON
};

export type PlaidItemRecord = {
  userId: string;
  itemId: string;
  accessToken: string;
  institutionName: string | null;
  bankSafetyScore: number;
  bankSignals: string;
};

export async function upsertPlaidItem(
  db: D1Database,
  encryptionKey: string,
  input: PlaidItemInput
): Promise<void> {
  const accessToken = await encryptField(input.accessToken, encryptionKey);
  await db
    .prepare(
      `INSERT INTO plaid_items
         (user_id, item_id, access_token, institution_name, bank_safety_score, bank_signals)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         item_id = excluded.item_id,
         access_token = excluded.access_token,
         institution_name = excluded.institution_name,
         bank_safety_score = excluded.bank_safety_score,
         bank_signals = excluded.bank_signals,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      input.userId,
      input.itemId,
      accessToken,
      input.institutionName,
      input.bankSafetyScore,
      input.bankSignals
    )
    .run();
}

export async function getPlaidItem(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<PlaidItemRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, item_id, access_token, institution_name, bank_safety_score, bank_signals
       FROM plaid_items WHERE user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      item_id: string;
      access_token: string;
      institution_name: string | null;
      bank_safety_score: number;
      bank_signals: string;
    }>();

  if (!row) return null;

  return {
    userId: row.user_id,
    itemId: row.item_id,
    accessToken: await decryptField(row.access_token, encryptionKey),
    institutionName: row.institution_name,
    bankSafetyScore: row.bank_safety_score,
    bankSignals: row.bank_signals,
  };
}
