type DocumentType = "account_opened" | "loan_agreement" | "payment_receipt";

export async function saveDocument(
  db: D1Database,
  bucket: R2Bucket,
  input: {
    id: string;
    userId: string;
    documentType: DocumentType;
    referenceId?: string;
    pdfBytes: Uint8Array;
  }
): Promise<void> {
  const r2Key = `documents/${input.userId}/${input.documentType}/${input.id}.pdf`;

  await bucket.put(r2Key, input.pdfBytes, {
    httpMetadata: { contentType: "application/pdf" },
  });

  await db
    .prepare(
      `INSERT INTO documents (id, user_id, document_type, reference_id, r2_key)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(input.id, input.userId, input.documentType, input.referenceId ?? null, r2Key)
    .run();
}
