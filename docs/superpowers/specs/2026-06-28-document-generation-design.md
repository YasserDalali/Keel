# Document Generation Design

**Date:** 2026-06-28  
**Status:** Approved

## Goal

Automatically generate a branded PDF document whenever a customer opens an account, gets a loan approved, or pays an installment. Save each PDF to R2 and expose authenticated endpoints so both the customer and admin can retrieve it.

---

## Triggers

| Event | Existing route | Document type |
|---|---|---|
| Account registered | `POST /api/auth/register` | `account_opened` |
| Loan approved | `POST /api/loans/:id/approve` | `loan_agreement` |
| Installment paid | `POST /api/loans/:id/installments/:installmentId/pay` | `payment_receipt` |

Document generation fires synchronously after the DB write succeeds. The doc ID is included in the route's response body so the client can link to it immediately.

---

## Document Content

### `account_opened`
- Company header + welcome title
- Fields: Account ID (user ID), email, registration date
- Footer: document ID, generation timestamp

### `loan_agreement`
- Company header + "Loan Agreement" title
- Fields: Loan ID, borrower ID, principal amount, flat interest rate (5%), term in months, total repayable amount, monthly installment amount, disbursement date
- Summary installment table: installment #, due date, amount due
- Footer: document ID, generation timestamp, "This is a binding agreement"

### `payment_receipt`
- Company header + "Payment Receipt" title
- Fields: Receipt ID (document ID), Loan ID, Installment #, amount paid, payment method, new installment status (`partial` / `paid`), payment date
- Footer: document ID, generation timestamp

---

## Branding

- **Company name:** MicroLoans
- **Primary colour:** Navy `#1B3A6B` (header bar, section headings)
- **Accent colour:** Gold `#C9A84C` (horizontal rule, footer line)
- **Font:** Helvetica (built into pdf-lib — no font file needed)
- Every PDF: A4 size, 40pt margin, company name top-left in white on navy bar, document type top-right

---

## Infrastructure Changes

### New R2 bucket — `DOCS_BUCKET`

Added to `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "DOCS_BUCKET"
bucket_name = "microloans-documents"
```

R2 key pattern: `documents/{userId}/{documentType}/{documentId}.pdf`

### New DB table — `documents`

Migration `0005_documents.sql`:
```sql
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('account_opened', 'loan_agreement', 'payment_receipt')),
  reference_id  TEXT,
  r2_key      TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_documents_user ON documents(user_id);
```

`reference_id` holds the loan ID (for `loan_agreement`) or installment ID (for `payment_receipt`); NULL for `account_opened`.

### New `Bindings` field

`DOCS_BUCKET: R2Bucket` added to `api/src/types.ts`.

---

## New Code

### `api/src/documents/generator.ts`

Exports three functions — one per document type:

```ts
generateAccountOpenedPdf(data: { userId, email, createdAt }): Promise<Uint8Array>
generateLoanAgreementPdf(data: { loanId, borrowerId, amount, interestRate, termMonths, schedule }): Promise<Uint8Array>
generatePaymentReceiptPdf(data: { docId, loanId, installmentId, installmentNumber, amountPaid, paymentMethod, installmentStatus, paidAt }): Promise<Uint8Array>
```

Shared private helpers:
- `drawHeader(page, title)` — navy bar + company name + document type
- `drawFooter(page, docId)` — gold rule + doc ID + timestamp

### `api/src/documents/store.ts`

Single export:

```ts
saveDocument(
  db: D1Database,
  bucket: R2Bucket,
  input: {
    id: string;  // caller pre-generates so PDF footer can include it
    userId: string;
    documentType: 'account_opened' | 'loan_agreement' | 'payment_receipt';
    referenceId?: string;
    pdfBytes: Uint8Array;
  }
): Promise<void>
```

Caller generates the UUID with `crypto.randomUUID()` before calling the PDF generator (so the ID can appear in the PDF footer), then passes the same ID here. `saveDocument` derives the R2 key, uploads bytes, and inserts the `documents` row.

### `api/src/routes/documents.ts`

Two endpoints, both auth-gated:

**`GET /api/documents`**  
Returns list of document metadata (no PDF bytes). Borrower sees only their own rows; officer/admin sees all. Query param `?userId=` allowed for officer/admin to filter by user.

Response:
```json
{ "documents": [{ "id", "userId", "documentType", "referenceId", "createdAt" }] }
```

**`GET /api/documents/:id`**  
Fetches the R2 object by `r2_key` from the `documents` row. Returns the PDF with `Content-Type: application/pdf` and `Content-Disposition: attachment`. Borrower may only fetch documents where `user_id = their own ID`; officer/admin may fetch any.

Returns 404 if the document row or the R2 object is missing.

---

## Route Modifications

### `api/src/routes/auth.ts` — `POST /api/auth/register`

After the `INSERT INTO users` succeeds:
1. `const docId = crypto.randomUUID()`
2. Call `generateAccountOpenedPdf({ docId, userId: id, email, createdAt: new Date().toISOString() })`
3. Call `saveDocument(db, bucket, { id: docId, userId: id, documentType: 'account_opened', pdfBytes })`
4. Add `documentId` to the `201` response: `{ id, email, documentId: docId }`

### `api/src/routes/loans.ts` — `POST /api/loans/:id/approve`

After the D1 batch succeeds (and `updateResult.meta.changes !== 0`):
1. Re-query the loan for `borrower_id` (already have `amount`, `interest_rate`, `term_months`, and `schedule` in scope)
2. `const docId = crypto.randomUUID()`
3. Call `generateLoanAgreementPdf({ docId, loanId, borrowerId, amount, interestRate, termMonths, schedule })`
4. Call `saveDocument(db, bucket, { id: docId, userId: borrowerId, documentType: 'loan_agreement', referenceId: loanId, pdfBytes })`
5. Add `documentId: docId` to the `200` response.

### `api/src/routes/loans.ts` — `POST /api/loans/:id/installments/:installmentId/pay`

After the D1 batch succeeds:
1. Re-query `installments JOIN loans` for `installment_number` and `loans.borrower_id`
2. `const docId = crypto.randomUUID()`
3. Call `generatePaymentReceiptPdf({ docId, loanId, installmentId, installmentNumber, amountPaid, paymentMethod, installmentStatus: newStatus, paidAt: new Date().toISOString() })`
4. Call `saveDocument(db, bucket, { id: docId, userId: borrowerId, documentType: 'payment_receipt', referenceId: installmentId, pdfBytes })`
5. Add `documentId: docId` to the response.

---

## Access Control

| Role | `GET /api/documents` | `GET /api/documents/:id` |
|---|---|---|
| borrower | Own documents only | Own documents only |
| officer | All documents | All documents |
| admin | All documents | All documents |

---

## Testing

Tests run in `@cloudflare/vitest-pool-workers` (miniflare). PDF byte generation can be tested with pure unit tests (no miniflare needed — just call the generator functions and assert the result is a non-empty `Uint8Array` starting with `%PDF`).

Integration tests for `store.ts` and `routes/documents.ts` use the real miniflare D1/R2 bindings. `DOCS_BUCKET` is picked up automatically from `wrangler.toml` by miniflare — no extra entry in `vitest.config.ts` is needed (same pattern as `KYC_BUCKET` previously was).

Key test cases:
- `generateAccountOpenedPdf` returns bytes starting with `%PDF`
- `generateLoanAgreementPdf` returns bytes starting with `%PDF`
- `generatePaymentReceiptPdf` returns bytes starting with `%PDF`
- `POST /api/auth/register` response includes `documentId`; R2 object exists at expected key
- `POST /api/loans/:id/approve` response includes `documentId`; R2 object exists
- `POST /api/loans/:id/installments/:installmentId/pay` response includes `documentId`; R2 object exists
- `GET /api/documents` returns own documents for borrower, all for admin
- `GET /api/documents/:id` returns PDF bytes for owner; 403 for another borrower; 200 for admin

---

## File Map

| Action | Path |
|---|---|
| CREATE | `api/migrations/0005_documents.sql` |
| CREATE | `api/src/documents/generator.ts` |
| CREATE | `api/src/documents/store.ts` |
| CREATE | `api/src/routes/documents.ts` |
| CREATE | `api/test/documents.spec.ts` |
| MODIFY | `api/src/types.ts` — add `DOCS_BUCKET` |
| MODIFY | `api/src/index.ts` — mount documents route |
| MODIFY | `api/src/routes/auth.ts` — generate doc on register |
| MODIFY | `api/src/routes/loans.ts` — generate doc on approve and on pay |
| MODIFY | `wrangler.toml` — add `DOCS_BUCKET` r2 bucket |
