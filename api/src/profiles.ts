import { encryptField, decryptField } from "./crypto";

export type ProfileInput = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
};

export type ProfileRecord = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
  kycStatus: "pending" | "approved" | "rejected";
};

export async function createProfile(
  db: D1Database,
  encryptionKey: string,
  input: ProfileInput
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
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(input.userId, firstName, lastName, phone, address, nationalIdNumber)
    .run();
}

export async function getProfile(
  db: D1Database,
  encryptionKey: string,
  userId: string
): Promise<ProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT user_id, first_name, last_name, phone, address, national_id_number, kyc_status
       FROM profiles WHERE user_id = ?`
    )
    .bind(userId)
    .first<{
      user_id: string;
      first_name: string;
      last_name: string;
      phone: string;
      address: string;
      national_id_number: string;
      kyc_status: "pending" | "approved" | "rejected";
    }>();

  if (!row) {
    return null;
  }

  const [firstName, lastName, phone, address, nationalIdNumber] = await Promise.all([
    decryptField(row.first_name, encryptionKey),
    decryptField(row.last_name, encryptionKey),
    decryptField(row.phone, encryptionKey),
    decryptField(row.address, encryptionKey),
    decryptField(row.national_id_number, encryptionKey),
  ]);

  return {
    userId: row.user_id,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
    kycStatus: row.kyc_status,
  };
}
