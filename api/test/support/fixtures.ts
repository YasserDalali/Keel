// Test fixtures: write borrower and bank-link data through the real repositories (so encryption is exercised),
// without going through HTTP. Not part of the application.
import { PersonalDetails } from "../../src/contexts/borrower/domain/personal-details";
import { Profile, type KycStatus } from "../../src/contexts/borrower/domain/profile";
import { D1ProfileRepository } from "../../src/contexts/borrower/infrastructure/d1-profile-repository";
import { encryptField } from "../../src/shared/crypto";
import { BankLink } from "../../src/contexts/borrower/domain/bank-link";
import { D1BankLinkRepository } from "../../src/contexts/borrower/infrastructure/d1-bank-link-repository";

export type ProfileRecord = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  nationalIdNumber: string | null;
  kycStatus: KycStatus;
  diditSessionId: string | null;
};

const record = (p: Profile): ProfileRecord => ({ userId: p.userId, ...p.details, kycStatus: p.kycStatus, diditSessionId: p.verificationSessionId });

export async function getProfile(db: D1Database, encryptionKey: string, userId: string): Promise<ProfileRecord | null> {
  const p = await new D1ProfileRepository(db, encryptionKey).byUserId(userId);
  return p && record(p);
}

export async function upsertProfile(
  db: D1Database, encryptionKey: string,
  input: { userId: string; firstName: string; lastName: string; phone: string; address: string; nationalIdNumber: string },
): Promise<void> {
  const repo = new D1ProfileRepository(db, encryptionKey);
  const details = PersonalDetails.of(input);
  const existing = await repo.byUserId(input.userId);
  if (existing) existing.updateDetails(details);
  await repo.save(existing ?? Profile.startWithDetails(input.userId, details));
}

/** Writes a profile row directly, with only some details and an optional session (test support). */
export async function createProfile(
  db: D1Database, encryptionKey: string,
  input: { userId: string; firstName?: string; lastName?: string; phone?: string; address?: string; nationalIdNumber?: string; diditSessionId?: string },
): Promise<void> {
  const seal = (v?: string) => (v != null ? encryptField(v, encryptionKey) : Promise.resolve(null));
  const [a, b, c, d, e] = await Promise.all([seal(input.firstName), seal(input.lastName), seal(input.phone), seal(input.address), seal(input.nationalIdNumber)]);
  await db
    .prepare("INSERT INTO profiles (user_id, first_name, last_name, phone, address, national_id_number, didit_session_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(input.userId, a, b, c, d, e, input.diditSessionId ?? null)
    .run();
}

/** Records a verification result as the provider's notification would (the provider's word is authoritative). */
export async function upsertVerificationStatus(db: D1Database, userId: string, status: KycStatus, sessionId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, kyc_status, didit_session_id, kyc_updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET kyc_status = excluded.kyc_status, didit_session_id = excluded.didit_session_id, kyc_updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, status, sessionId)
    .run();
}


export type PlaidItemInput = { userId: string; itemId: string; accessToken: string; institutionName: string | null; bankSafetyScore: number; bankSignals: string };
export type PlaidItemRecord = PlaidItemInput;

export async function upsertPlaidItem(db: D1Database, encryptionKey: string, input: PlaidItemInput): Promise<void> {
  await new D1BankLinkRepository(db, encryptionKey).save(
    BankLink.record({ userId: input.userId, itemId: input.itemId, accessToken: input.accessToken, institutionName: input.institutionName, safetyScore: input.bankSafetyScore, signals: input.bankSignals }),
  );
}

export async function getPlaidItem(db: D1Database, encryptionKey: string, userId: string): Promise<PlaidItemRecord | null> {
  const l = await new D1BankLinkRepository(db, encryptionKey).byUserId(userId);
  return l && { userId: l.userId, itemId: l.itemId, accessToken: l.accessToken, institutionName: l.institutionName, bankSafetyScore: l.safetyScore, bankSignals: l.signals };
}
