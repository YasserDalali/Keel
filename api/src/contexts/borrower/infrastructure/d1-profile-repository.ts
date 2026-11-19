import { fromSqlTimestamp, toSqlTimestamp } from "../../../shared/clock";
import { decryptField, encryptField } from "../../../shared/crypto";
import { Profile, type KycStatus } from "../domain/profile";
import type { ProfileRepository } from "../domain/repositories";

type Row = {
  user_id: string; first_name: string | null; last_name: string | null; phone: string | null; address: string | null;
  national_id_number: string | null; kyc_status: KycStatus; didit_session_id: string | null; kyc_updated_at: string | null;
};

const seal = (v: string | null, key: string) => (v != null ? encryptField(v, key) : Promise.resolve(null));
const open = (v: string | null, key: string) => (v != null ? decryptField(v, key) : Promise.resolve(null));

/** Personal details are encrypted (AES-GCM) on the way in and decrypted on the way out; the database only ever holds ciphertext. */
export class D1ProfileRepository implements ProfileRepository {
  constructor(private readonly db: D1Database, private readonly encryptionKey: string) {}

  async byUserId(userId: string): Promise<Profile | null> {
    const row = await this.db
      .prepare(
        `SELECT user_id, first_name, last_name, phone, address, national_id_number, kyc_status, didit_session_id, kyc_updated_at
           FROM profiles WHERE user_id = ?`,
      )
      .bind(userId)
      .first<Row>();
    if (!row) return null;
    const k = this.encryptionKey;
    const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
      open(row.first_name, k), open(row.last_name, k), open(row.phone, k), open(row.address, k), open(row.national_id_number, k),
    ]);
    return Profile.restore({
      userId: row.user_id,
      details: { firstName, lastName, phone, address, nationalIdNumber },
      kycStatus: row.kyc_status,
      verificationSessionId: row.didit_session_id,
      kycUpdatedAt: row.kyc_updated_at ? fromSqlTimestamp(row.kyc_updated_at) : null,
    });
  }

  async kycStatusOf(userId: string): Promise<KycStatus | null> {
    const row = await this.db.prepare("SELECT kyc_status FROM profiles WHERE user_id = ?").bind(userId).first<{ kyc_status: KycStatus }>();
    return row?.kyc_status ?? null;
  }

  async save(p: Profile): Promise<void> {
    const k = this.encryptionKey;
    const d = p.details;
    const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
      seal(d.firstName, k), seal(d.lastName, k), seal(d.phone, k), seal(d.address, k), seal(d.nationalIdNumber, k),
    ]);
    await this.db
      .prepare(
        `INSERT INTO profiles (user_id, first_name, last_name, phone, address, national_id_number, kyc_status, didit_session_id, kyc_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           first_name = excluded.first_name, last_name = excluded.last_name, phone = excluded.phone, address = excluded.address,
           national_id_number = excluded.national_id_number, kyc_status = excluded.kyc_status,
           didit_session_id = excluded.didit_session_id, kyc_updated_at = excluded.kyc_updated_at`,
      )
      .bind(
        p.userId, firstName, lastName, phone, address, nationalIdNumber, p.kycStatus, p.verificationSessionId,
        p.kycUpdatedAt ? toSqlTimestamp(p.kycUpdatedAt) : null,
      )
      .run();
  }
}
