import { encryptField, decryptField } from "./crypto";

export type ProfileInput = {
  userId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  nationalIdNumber?: string;
  diditSessionId?: string;
};

export type ProfileRecord = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  nationalIdNumber: string | null;
  kycStatus: "pending" | "approved" | "declined" | "in_review" | "in_progress" | "abandoned" | "expired" | "resubmitted";
  diditSessionId: string | null;
};

async function encryptOrNull(value: string | undefined, key: string): Promise<string | null> {
  return value != null ? encryptField(value, key) : null;
}

async function decryptOrNull(value: string | null, key: string): Promise<string | null> {
  return value != null ? decryptField(value, key) : null;
}

export async function createProfile(
  db: D1Database,
  encryptionKey: string,
  input: ProfileInput
): Promise<void> {
  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    encryptOrNull(input.firstName, encryptionKey),
    encryptOrNull(input.lastName, encryptionKey),
    encryptOrNull(input.phone, encryptionKey),
    encryptOrNull(input.address, encryptionKey),
    encryptOrNull(input.nationalIdNumber, encryptionKey),
  ]);

  await db
    .prepare(
      `INSERT INTO profiles
         (user_id, first_name, last_name, phone, address, national_id_number, didit_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(input.userId, firstName, lastName, phone, address, nationalIdNumber, input.diditSessionId ?? null)
    .run();
}

export async function upsertProfile(
  db: D1Database,
  encryptionKey: string,
  input: {
    userId: string;
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    nationalIdNumber: string;
  }
): Promise<void> {
  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    encryptField(input.firstName, encryptionKey),
    encryptField(input.lastName, encryptionKey),
    encryptField(input.phone, encryptionKey),
    encryptField(input.address, encryptionKey),
    encryptField(input.nationalIdNumber, encryptionKey),
  ]);

  await db
    .prepare(
      `INSERT INTO profiles (user_id, first_name, last_name, phone, address, national_id_number)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         first_name         = excluded.first_name,
         last_name          = excluded.last_name,
         phone              = excluded.phone,
         address            = excluded.address,
         national_id_number = excluded.national_id_number`
    )
    .bind(input.userId, firstName, lastName, phone, address, nationalIdNumber)
    .run();
}

export async function upsertVerificationStatus(
  db: D1Database,
  userId: string,
  kycStatus: ProfileRecord["kycStatus"],
  diditSessionId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, kyc_status, didit_session_id)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         kyc_status = excluded.kyc_status,
         didit_session_id = excluded.didit_session_id`
    )
    .bind(userId, kycStatus, diditSessionId)
    .run();
}

export async function getProfile(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<ProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, first_name, last_name, phone, address, national_id_number,
              kyc_status, didit_session_id
       FROM profiles WHERE user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      address: string | null;
      national_id_number: string | null;
      kyc_status: ProfileRecord["kycStatus"];
      didit_session_id: string | null;
    }>();

  if (!row) return null;

  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    decryptOrNull(row.first_name, encryptionKey),
    decryptOrNull(row.last_name, encryptionKey),
    decryptOrNull(row.phone, encryptionKey),
    decryptOrNull(row.address, encryptionKey),
    decryptOrNull(row.national_id_number, encryptionKey),
  ]);

  return {
    userId: row.user_id,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
    kycStatus: row.kyc_status,
    diditSessionId: row.didit_session_id,
  };
}
