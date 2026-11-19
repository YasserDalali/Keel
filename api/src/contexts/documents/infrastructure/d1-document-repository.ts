import { documentTitle, type DocumentQueries, type DocumentRepository, type DocumentSummary, type NewDocument } from "../domain/document";

/** Stores the PDF in R2 and its record in the documents table. */
export async function saveDocument(
  db: D1Database,
  bucket: R2Bucket,
  input: { id: string; userId: string; documentType: NewDocument["type"]; referenceId?: string; pdfBytes: Uint8Array },
): Promise<void> {
  const r2Key = `documents/${input.userId}/${input.documentType}/${input.id}.pdf`;
  await bucket.put(r2Key, input.pdfBytes, { httpMetadata: { contentType: "application/pdf" } });
  await db
    .prepare("INSERT INTO documents (id, user_id, document_type, reference_id, r2_key) VALUES (?, ?, ?, ?, ?)")
    .bind(input.id, input.userId, input.documentType, input.referenceId ?? null, r2Key)
    .run();
}

export class R2D1DocumentRepository implements DocumentRepository {
  constructor(private readonly db: D1Database, private readonly bucket: R2Bucket) {}

  add(doc: NewDocument, pdf: Uint8Array): Promise<void> {
    return saveDocument(this.db, this.bucket, { id: doc.id, userId: doc.ownerId, documentType: doc.type, referenceId: doc.referenceId, pdfBytes: pdf });
  }

  async contentOf(id: string) {
    const row = await this.db.prepare("SELECT user_id, r2_key FROM documents WHERE id = ?").bind(id).first<{ user_id: string; r2_key: string }>();
    if (!row) return null;
    const obj = await this.bucket.get(row.r2_key);
    return obj ? { ownerId: row.user_id, pdf: await obj.arrayBuffer() } : null;
  }
}

type DocRow = {
  id: string; user_id: string; document_type: string; reference_id: string | null; r2_key: string; created_at: string;
  loan_id: string | null; installment_number: number | null; installment_count: number | null; amount: number | null;
};

// Receipts point at an installment, agreements and deposit receipts at a loan, statements at a month ("YYYY-MM").
// ponytail: joins lending's tables for the loan and amount shown; becomes a read model fed by events if the contexts are ever split apart.
const DOC_SELECT = `
  SELECT d.id, d.user_id, d.document_type, d.reference_id, d.r2_key, d.created_at,
         COALESCE(i.loan_id, l.id) AS loan_id,
         i.installment_number,
         (SELECT COUNT(*) FROM installments x WHERE x.loan_id = i.loan_id) AS installment_count,
         CASE d.document_type
           WHEN 'loan_agreement' THEN l.amount
           WHEN 'deposit_receipt' THEN l.upfront_amount
           WHEN 'payment_receipt' THEN COALESCE(
             (SELECT t.amount FROM transactions t WHERE t.installment_id = d.reference_id AND t.type = 'repayment' AND t.created_at <= d.created_at
               ORDER BY t.created_at DESC, t.rowid DESC LIMIT 1),
             i.amount_due)
         END AS amount
    FROM documents d
    LEFT JOIN installments i ON d.document_type = 'payment_receipt' AND i.id = d.reference_id
    LEFT JOIN loans l ON d.document_type IN ('loan_agreement', 'deposit_receipt') AND l.id = d.reference_id`;

const toSummary = (r: DocRow): DocumentSummary => ({
  id: r.id, ownerId: r.user_id, type: r.document_type, referenceId: r.reference_id, storageKey: r.r2_key, createdAt: r.created_at,
  title: documentTitle(r.document_type, r.reference_id, r.installment_number, r.installment_count), loanId: r.loan_id, amount: r.amount,
});

export class D1DocumentQueries implements DocumentQueries {
  constructor(private readonly db: D1Database) {}

  async list(ownerId?: string): Promise<DocumentSummary[]> {
    const stmt = this.db.prepare(`${DOC_SELECT}${ownerId ? " WHERE d.user_id = ?" : ""} ORDER BY d.created_at DESC, d.rowid DESC`);
    const { results } = await (ownerId ? stmt.bind(ownerId) : stmt).all<DocRow>();
    return results.map(toSummary);
  }

  async byId(id: string): Promise<DocumentSummary | null> {
    const row = await this.db.prepare(`${DOC_SELECT} WHERE d.id = ?`).bind(id).first<DocRow>();
    return row ? toSummary(row) : null;
  }
}
