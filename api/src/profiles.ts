import { encryptField, decryptField } from "./crypto";

export type ProfileInput = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
  kycDocumentR2Key: string;
  ocrExtractedData: string;
};

export type ProfileRecord = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  nationalIdNumber: string;
  kycStatus: "pending" | "approved" | "rejected";
  kycDocumentR2Key: string;
  ocrExtractedData: string;
};

export async function createProfile(
  db: D1Database,
  encryptionKey: string,
  input: ProfileInput
): Promise<void> {
  const [firstName, lastName, phone, address, nationalIdNumber, ocrExtractedData] =
    await Promise.all([
      encryptField(input.firstName, encryptionKey),
      encryptField(input.lastName, encryptionKey),
      encryptField(input.phone, encryptionKey),
      encryptField(input.address, encryptionKey),
      encryptField(input.nationalIdNumber, encryptionKey),
      encryptField(input.ocrExtractedData, encryptionKey),
    ]);

  await db
    .prepare(
      `INSERT INTO profiles
         (user_id, first_name, last_name, phone, address, national_id_number,
          kyc_document_r2_key, ocr_extracted_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.userId,
      firstName,
      lastName,
      phone,
      address,
      nationalIdNumber,
      input.kycDocumentR2Key,
      ocrExtractedData
    )
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
              kyc_status, kyc_document_r2_key, ocr_extracted_data
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
      kyc_document_r2_key: string;
      ocr_extracted_data: string;
    }>();

  if (!row) {
    return null;
  }

  const [firstName, lastName, phone, address, nationalIdNumber, ocrExtractedData] =
    await Promise.all([
      decryptField(row.first_name, encryptionKey),
      decryptField(row.last_name, encryptionKey),
      decryptField(row.phone, encryptionKey),
      decryptField(row.address, encryptionKey),
      decryptField(row.national_id_number, encryptionKey),
      decryptField(row.ocr_extracted_data, encryptionKey),
    ]);

  return {
    userId: row.user_id,
    firstName,
    lastName,
    phone,
    address,
    nationalIdNumber,
    kycStatus: row.kyc_status,
    kycDocumentR2Key: row.kyc_document_r2_key,
    ocrExtractedData,
  };
}
