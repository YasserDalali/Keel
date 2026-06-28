# Document Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate a branded PDF (account opened / loan agreement / payment receipt) on three user events, store it in R2, and expose authenticated list + download endpoints.

**Architecture:** `pdf-lib` (pure JS, no external calls) generates PDFs synchronously inside each route handler. A shared `saveDocument()` helper stores bytes to `DOCS_BUCKET` (R2) and records metadata in a new `documents` D1 table. Two new endpoints (`GET /api/documents`, `GET /api/documents/:id`) serve the catalogue and raw PDF. Caller pre-generates the UUID so it can appear in the PDF footer before the row is written.

**Tech Stack:** Hono, pdf-lib ^1.17.1, Cloudflare D1 + R2, `@cloudflare/vitest-pool-workers`.

## Global Constraints

- pdf-lib import: `import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'`
- A4 page size: 595.28 × 841.89 pt (pdf-lib points, Y=0 is bottom)
- Brand navy: `rgb(0.106, 0.227, 0.420)` — hex `#1B3A6B`
- Brand gold: `rgb(0.788, 0.659, 0.298)` — hex `#C9A84C`
- R2 key pattern: `documents/{userId}/{documentType}/{docId}.pdf`
- Caller pre-generates `docId = crypto.randomUUID()` before calling the generator, then passes the same ID to `saveDocument`.
- Tests run inside miniflare (`@cloudflare/vitest-pool-workers`). R2 `DOCS_BUCKET` is declared in `wrangler.toml`; miniflare picks it up automatically — no extra `vitest.config.ts` entry needed.
- Never use `jest.spyOn(globalThis, 'fetch')` — use `fetchMock` from `cloudflare:test`.

---

## File Map

| Action | Path |
|--------|------|
| CREATE | `api/migrations/0005_documents.sql` |
| MODIFY | `wrangler.toml` |
| MODIFY | `api/src/types.ts` |
| CREATE | `api/src/documents/generator.ts` |
| CREATE | `api/src/documents/store.ts` |
| CREATE | `api/src/routes/documents.ts` |
| MODIFY | `api/src/index.ts` |
| MODIFY | `api/src/routes/auth.ts` |
| MODIFY | `api/src/routes/loans.ts` |
| CREATE | `api/test/documents-generator.spec.ts` |
| CREATE | `api/test/documents.spec.ts` |

---

## Task 1: Infrastructure — Migration, Wrangler, Types

**Files:**
- Create: `api/migrations/0005_documents.sql`
- Modify: `wrangler.toml`
- Modify: `api/src/types.ts`

**Interfaces:**
- Produces: `documents` D1 table; `DOCS_BUCKET` R2 binding available in `c.env` and tests; `Bindings.DOCS_BUCKET: R2Bucket` type.

- [ ] **Step 1: Create the migration**

Create `api/migrations/0005_documents.sql`:

```sql
CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('account_opened', 'loan_agreement', 'payment_receipt')),
  reference_id  TEXT,
  r2_key        TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_documents_user ON documents(user_id);
```

- [ ] **Step 2: Add `DOCS_BUCKET` to `wrangler.toml`**

Append to `/home/yasser/Desktop/Big-5/microloans/wrangler.toml`:

```toml
[[r2_buckets]]
binding = "DOCS_BUCKET"
bucket_name = "microloans-documents"
```

- [ ] **Step 3: Add `DOCS_BUCKET` to `api/src/types.ts`**

Replace `api/src/types.ts` entirely:

```ts
export type Bindings = {
  DB: D1Database;
  LOAN_CACHE: KVNamespace;
  DOCS_BUCKET: R2Bucket;
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  PII_ENCRYPTION_KEY: string;
  DIDIT_WEBHOOK_SECRET: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
};

export type Variables = {
  userId: string;
  role: "borrower" | "officer" | "admin";
  jti: string;
  exp: number;
};
```

- [ ] **Step 4: Dry-run migration locally**

```bash
cd /home/yasser/Desktop/Big-5/microloans
wrangler d1 execute microloans_db --local --file=api/migrations/0005_documents.sql
```

Expected: no errors output.

- [ ] **Step 5: Commit**

```bash
cd /home/yasser/Desktop/Big-5/microloans
git add api/migrations/0005_documents.sql wrangler.toml api/src/types.ts
git commit -m "feat: add documents table, DOCS_BUCKET R2 binding"
```

---

## Task 2: PDF Generator Module

**Files:**
- Create: `api/src/documents/generator.ts`
- Create: `api/test/documents-generator.spec.ts`

**Interfaces:**
- Produces (all `async`, all return `Promise<Uint8Array>`):
  ```ts
  generateAccountOpenedPdf(data: {
    docId: string; userId: string; email: string; createdAt: string;
  }): Promise<Uint8Array>

  generateLoanAgreementPdf(data: {
    docId: string; loanId: string; borrowerId: string;
    amount: number; interestRate: number; termMonths: number;
    schedule: { installmentNumber: number; dueDate: string; amountDue: number }[];
  }): Promise<Uint8Array>

  generatePaymentReceiptPdf(data: {
    docId: string; loanId: string; installmentId: string;
    installmentNumber: number; amountPaid: number;
    paymentMethod: string; installmentStatus: string; paidAt: string;
  }): Promise<Uint8Array>
  ```

- [ ] **Step 1: Install pdf-lib**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npm install pdf-lib
```

Expected: `pdf-lib` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `api/test/documents-generator.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  generateAccountOpenedPdf,
  generateLoanAgreementPdf,
  generatePaymentReceiptPdf,
} from "../src/documents/generator";

const PDF_MAGIC = "%PDF";

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 4)) === PDF_MAGIC;
}

const SCHEDULE = [
  { installmentNumber: 1, dueDate: "2026-07-28", amountDue: 105.0 },
  { installmentNumber: 2, dueDate: "2026-08-28", amountDue: 105.0 },
  { installmentNumber: 3, dueDate: "2026-09-28", amountDue: 105.0 },
];

describe("generateAccountOpenedPdf", () => {
  it("returns a valid PDF binary", async () => {
    const bytes = await generateAccountOpenedPdf({
      docId: "doc-001",
      userId: "user-001",
      email: "jane@example.com",
      createdAt: "2026-06-28T00:00:00.000Z",
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isPdf(bytes)).toBe(true);
  });
});

describe("generateLoanAgreementPdf", () => {
  it("returns a valid PDF binary", async () => {
    const bytes = await generateLoanAgreementPdf({
      docId: "doc-002",
      loanId: "loan-001",
      borrowerId: "user-001",
      amount: 300,
      interestRate: 0.05,
      termMonths: 3,
      schedule: SCHEDULE,
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isPdf(bytes)).toBe(true);
  });
});

describe("generatePaymentReceiptPdf", () => {
  it("returns a valid PDF binary", async () => {
    const bytes = await generatePaymentReceiptPdf({
      docId: "doc-003",
      loanId: "loan-001",
      installmentId: "inst-001",
      installmentNumber: 1,
      amountPaid: 105.0,
      paymentMethod: "mock_gateway",
      installmentStatus: "paid",
      paidAt: "2026-06-28T12:00:00.000Z",
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    expect(isPdf(bytes)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/documents-generator.spec.ts
```

Expected: FAIL — `Cannot find module '../src/documents/generator'`.

- [ ] **Step 4: Implement `api/src/documents/generator.ts`**

```ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const NAVY = rgb(0.106, 0.227, 0.420);
const GOLD = rgb(0.788, 0.659, 0.298);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.15, 0.15, 0.15);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

async function basePdf(docTitle: string): Promise<{
  doc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  // Navy header bar
  page.drawRectangle({ x: 0, y: PAGE_H - 47, width: PAGE_W, height: 47, color: NAVY });
  page.drawText("MicroLoans", { x: MARGIN, y: PAGE_H - 32, font: bold, size: 18, color: WHITE });
  const titleW = regular.widthOfTextAtSize(docTitle, 10);
  page.drawText(docTitle, { x: PAGE_W - MARGIN - titleW, y: PAGE_H - 31, font: regular, size: 10, color: WHITE });

  return { doc, page, bold, regular };
}

function drawFooter(
  page: ReturnType<PDFDocument["addPage"]>,
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  docId: string
): void {
  page.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: PAGE_W - MARGIN, y: 50 }, thickness: 1.5, color: GOLD });
  page.drawText(`Document ID: ${docId}`, { x: MARGIN, y: 32, font: regular, size: 8, color: DARK });
  const genText = `Generated: ${new Date().toISOString().slice(0, 10)}`;
  const genW = regular.widthOfTextAtSize(genText, 8);
  page.drawText(genText, { x: PAGE_W - MARGIN - genW, y: 32, font: regular, size: 8, color: DARK });
}

function drawField(
  page: ReturnType<PDFDocument["addPage"]>,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  label: string,
  value: string,
  y: number
): void {
  page.drawText(label, { x: MARGIN, y, font: bold, size: 11, color: NAVY });
  page.drawText(value, { x: 200, y, font: regular, size: 11, color: DARK });
}

export async function generateAccountOpenedPdf(data: {
  docId: string;
  userId: string;
  email: string;
  createdAt: string;
}): Promise<Uint8Array> {
  const { doc, page, bold, regular } = await basePdf("Account Opening Confirmation");

  page.drawText("Welcome to MicroLoans", { x: MARGIN, y: 750, font: bold, size: 22, color: NAVY });
  page.drawText("Your account has been successfully created.", { x: MARGIN, y: 718, font: regular, size: 12, color: DARK });

  page.drawLine({ start: { x: MARGIN, y: 700 }, end: { x: PAGE_W - MARGIN, y: 700 }, thickness: 0.5, color: GOLD });

  let y = 668;
  drawField(page, bold, regular, "Account ID:", data.userId, y); y -= 26;
  drawField(page, bold, regular, "Email:", data.email, y); y -= 26;
  drawField(page, bold, regular, "Date Opened:", new Date(data.createdAt).toDateString(), y);

  drawFooter(page, regular, data.docId);
  return doc.save();
}

export async function generateLoanAgreementPdf(data: {
  docId: string;
  loanId: string;
  borrowerId: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  schedule: { installmentNumber: number; dueDate: string; amountDue: number }[];
}): Promise<Uint8Array> {
  const { doc, page, bold, regular } = await basePdf("Loan Agreement");

  const totalRepayable = data.amount * (1 + data.interestRate);
  const monthlyAmount = data.schedule[0]?.amountDue ?? 0;

  page.drawText("Loan Agreement", { x: MARGIN, y: 750, font: bold, size: 22, color: NAVY });
  page.drawLine({ start: { x: MARGIN, y: 732 }, end: { x: PAGE_W - MARGIN, y: 732 }, thickness: 0.5, color: GOLD });

  let y = 700;
  drawField(page, bold, regular, "Loan ID:", data.loanId, y); y -= 24;
  drawField(page, bold, regular, "Borrower ID:", data.borrowerId, y); y -= 24;
  drawField(page, bold, regular, "Principal:", `$${data.amount.toFixed(2)}`, y); y -= 24;
  drawField(page, bold, regular, "Interest Rate:", `${(data.interestRate * 100).toFixed(0)}% flat`, y); y -= 24;
  drawField(page, bold, regular, "Term:", `${data.termMonths} months`, y); y -= 24;
  drawField(page, bold, regular, "Total Repayable:", `$${totalRepayable.toFixed(2)}`, y); y -= 24;
  drawField(page, bold, regular, "Monthly Payment:", `~$${monthlyAmount.toFixed(2)}`, y); y -= 24;
  drawField(page, bold, regular, "Disbursement Date:", new Date().toDateString(), y); y -= 36;

  // Schedule table header
  page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - 2 * MARGIN, height: 18, color: NAVY });
  page.drawText("#", { x: MARGIN + 4, y: y, font: bold, size: 10, color: WHITE });
  page.drawText("Due Date", { x: MARGIN + 40, y: y, font: bold, size: 10, color: WHITE });
  page.drawText("Amount Due", { x: MARGIN + 230, y: y, font: bold, size: 10, color: WHITE });
  y -= 18;

  for (const row of data.schedule) {
    if (y < 70) break; // stop before footer
    const bg = row.installmentNumber % 2 === 0 ? rgb(0.95, 0.95, 0.95) : WHITE;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - 2 * MARGIN, height: 16, color: bg });
    page.drawText(String(row.installmentNumber), { x: MARGIN + 4, y: y, font: regular, size: 10, color: DARK });
    page.drawText(row.dueDate, { x: MARGIN + 40, y: y, font: regular, size: 10, color: DARK });
    page.drawText(`$${row.amountDue.toFixed(2)}`, { x: MARGIN + 230, y: y, font: regular, size: 10, color: DARK });
    y -= 16;
  }

  page.drawText("This document constitutes a binding loan agreement.", {
    x: MARGIN, y: 65, font: regular, size: 8, color: DARK,
  });

  drawFooter(page, regular, data.docId);
  return doc.save();
}

export async function generatePaymentReceiptPdf(data: {
  docId: string;
  loanId: string;
  installmentId: string;
  installmentNumber: number;
  amountPaid: number;
  paymentMethod: string;
  installmentStatus: string;
  paidAt: string;
}): Promise<Uint8Array> {
  const { doc, page, bold, regular } = await basePdf("Payment Receipt");

  page.drawText("Payment Receipt", { x: MARGIN, y: 750, font: bold, size: 22, color: NAVY });
  page.drawLine({ start: { x: MARGIN, y: 732 }, end: { x: PAGE_W - MARGIN, y: 732 }, thickness: 0.5, color: GOLD });

  let y = 700;
  drawField(page, bold, regular, "Receipt ID:", data.docId, y); y -= 26;
  drawField(page, bold, regular, "Loan ID:", data.loanId, y); y -= 26;
  drawField(page, bold, regular, "Installment #:", String(data.installmentNumber), y); y -= 26;
  drawField(page, bold, regular, "Amount Paid:", `$${data.amountPaid.toFixed(2)}`, y); y -= 26;
  drawField(page, bold, regular, "Payment Method:", data.paymentMethod, y); y -= 26;
  drawField(page, bold, regular, "Status:", data.installmentStatus.toUpperCase(), y); y -= 26;
  drawField(page, bold, regular, "Date:", new Date(data.paidAt).toDateString(), y);

  drawFooter(page, regular, data.docId);
  return doc.save();
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/documents-generator.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/yasser/Desktop/Big-5/microloans
git add api/src/documents/generator.ts api/test/documents-generator.spec.ts api/package.json api/package-lock.json
git commit -m "feat: PDF generator module (account_opened, loan_agreement, payment_receipt)"
```

---

## Task 3: Document Store Module

**Files:**
- Create: `api/src/documents/store.ts`
- Test section of: `api/test/documents.spec.ts`

**Interfaces:**
- Consumes: `DOCS_BUCKET: R2Bucket`, `DB: D1Database` from env
- Produces:
  ```ts
  saveDocument(
    db: D1Database,
    bucket: R2Bucket,
    input: {
      id: string;
      userId: string;
      documentType: "account_opened" | "loan_agreement" | "payment_receipt";
      referenceId?: string;
      pdfBytes: Uint8Array;
    }
  ): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

Create `api/test/documents.spec.ts` (store tests only — Task 4 rewrites this file to add route tests alongside):

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { saveDocument } from "../src/documents/store";

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

describe("saveDocument", () => {
  it("writes the PDF to R2 and inserts a documents row", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "store-test@example.com");
    const docId = crypto.randomUUID();

    await saveDocument(env.DB, env.DOCS_BUCKET, {
      id: docId,
      userId,
      documentType: "account_opened",
      pdfBytes: FAKE_PDF,
    });

    const row = await env.DB.prepare(
      "SELECT id, user_id, document_type, reference_id, r2_key FROM documents WHERE id = ?"
    ).bind(docId).first<{ id: string; user_id: string; document_type: string; reference_id: string | null; r2_key: string }>();
    expect(row?.user_id).toBe(userId);
    expect(row?.document_type).toBe("account_opened");
    expect(row?.reference_id).toBeNull();
    expect(row?.r2_key).toBe(`documents/${userId}/account_opened/${docId}.pdf`);

    const obj = await env.DOCS_BUCKET.head(row!.r2_key);
    expect(obj).not.toBeNull();
  });

  it("stores the referenceId when provided", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "store-ref@example.com");
    const docId = crypto.randomUUID();
    const loanId = crypto.randomUUID();

    await saveDocument(env.DB, env.DOCS_BUCKET, {
      id: docId,
      userId,
      documentType: "loan_agreement",
      referenceId: loanId,
      pdfBytes: FAKE_PDF,
    });

    const row = await env.DB.prepare(
      "SELECT reference_id FROM documents WHERE id = ?"
    ).bind(docId).first<{ reference_id: string }>();
    expect(row?.reference_id).toBe(loanId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/documents.spec.ts
```

Expected: FAIL — `Cannot find module '../src/documents/store'`.

- [ ] **Step 3: Implement `api/src/documents/store.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/documents.spec.ts
```

Expected: 2 tests pass (store tests only).

- [ ] **Step 5: Commit**

```bash
cd /home/yasser/Desktop/Big-5/microloans
git add api/src/documents/store.ts api/test/documents.spec.ts
git commit -m "feat: saveDocument store (R2 upload + D1 insert)"
```

---

## Task 4: Documents Route + Wire into App

**Files:**
- Create: `api/src/routes/documents.ts`
- Modify: `api/src/index.ts`
- Modify: `api/test/documents.spec.ts` (append route tests)

**Interfaces:**
- Consumes: `requireAuth` from `../middleware/requireAuth`; `DOCS_BUCKET`, `DB` from `c.env`; `c.var.userId`, `c.var.role`
- Produces:
  - `GET /api/documents` → `{ documents: DocumentMeta[] }`
  - `GET /api/documents/:id` → PDF binary (200) or `{ error }` (403/404)

- [ ] **Step 1: Replace `api/test/documents.spec.ts` with the combined file (store + route tests)**

Write the complete `api/test/documents.spec.ts` (replaces the file from Task 3 — store tests are unchanged, route tests are new):

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { signJwt } from "../src/auth/jwt";
import { saveDocument } from "../src/documents/store";

async function insertUser(userId: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'borrower')"
  ).bind(userId, email).run();
}

async function authHeader(userId: string, role: "borrower" | "officer" | "admin"): Promise<Record<string, string>> {
  const token = await signJwt({ sub: userId, role }, env.JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

describe("saveDocument", () => {
  it("writes the PDF to R2 and inserts a documents row", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "store-test@example.com");
    const docId = crypto.randomUUID();

    await saveDocument(env.DB, env.DOCS_BUCKET, {
      id: docId,
      userId,
      documentType: "account_opened",
      pdfBytes: FAKE_PDF,
    });

    const row = await env.DB.prepare(
      "SELECT id, user_id, document_type, reference_id, r2_key FROM documents WHERE id = ?"
    ).bind(docId).first<{ id: string; user_id: string; document_type: string; reference_id: string | null; r2_key: string }>();
    expect(row?.user_id).toBe(userId);
    expect(row?.document_type).toBe("account_opened");
    expect(row?.reference_id).toBeNull();
    expect(row?.r2_key).toBe(`documents/${userId}/account_opened/${docId}.pdf`);

    const obj = await env.DOCS_BUCKET.head(row!.r2_key);
    expect(obj).not.toBeNull();
  });

  it("stores the referenceId when provided", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "store-ref@example.com");
    const docId = crypto.randomUUID();
    const loanId = crypto.randomUUID();

    await saveDocument(env.DB, env.DOCS_BUCKET, {
      id: docId,
      userId,
      documentType: "loan_agreement",
      referenceId: loanId,
      pdfBytes: FAKE_PDF,
    });

    const row = await env.DB.prepare(
      "SELECT reference_id FROM documents WHERE id = ?"
    ).bind(docId).first<{ reference_id: string }>();
    expect(row?.reference_id).toBe(loanId);
  });
});

describe("GET /api/documents", () => {
  it("returns only own documents for a borrower", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "list-borrower@example.com");
    const otherId = crypto.randomUUID();
    await insertUser(otherId, "list-other@example.com");

    await saveDocument(env.DB, env.DOCS_BUCKET, { id: crypto.randomUUID(), userId, documentType: "account_opened", pdfBytes: FAKE_PDF });
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: crypto.randomUUID(), userId: otherId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request("/api/documents", { headers: await authHeader(userId, "borrower") }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ documents: { userId: string }[] }>();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].userId).toBe(userId);
  });

  it("returns all documents for an admin", async () => {
    const adminId = crypto.randomUUID();
    await insertUser(adminId, "list-admin@example.com");
    const userId = crypto.randomUUID();
    await insertUser(userId, "list-admin-borrower@example.com");

    await saveDocument(env.DB, env.DOCS_BUCKET, { id: crypto.randomUUID(), userId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request("/api/documents", { headers: await authHeader(adminId, "admin") }, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ documents: unknown[] }>();
    expect(body.documents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/documents/:id", () => {
  it("returns the PDF for the document owner", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "dl-owner@example.com");
    const docId = crypto.randomUUID();
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: docId, userId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request(`/api/documents/${docId}`, { headers: await authHeader(userId, "borrower") }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns 403 for a different borrower", async () => {
    const ownerId = crypto.randomUUID();
    await insertUser(ownerId, "dl-realowner@example.com");
    const otherId = crypto.randomUUID();
    await insertUser(otherId, "dl-intruder@example.com");
    const docId = crypto.randomUUID();
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: docId, userId: ownerId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request(`/api/documents/${docId}`, { headers: await authHeader(otherId, "borrower") }, env);
    expect(res.status).toBe(403);
  });

  it("returns 200 for an admin fetching any document", async () => {
    const ownerId = crypto.randomUUID();
    await insertUser(ownerId, "dl-admin-owner@example.com");
    const adminId = crypto.randomUUID();
    await insertUser(adminId, "dl-admin@example.com");
    const docId = crypto.randomUUID();
    await saveDocument(env.DB, env.DOCS_BUCKET, { id: docId, userId: ownerId, documentType: "account_opened", pdfBytes: FAKE_PDF });

    const res = await app.request(`/api/documents/${docId}`, { headers: await authHeader(adminId, "admin") }, env);
    expect(res.status).toBe(200);
  });

  it("returns 404 for a nonexistent document", async () => {
    const userId = crypto.randomUUID();
    await insertUser(userId, "dl-404@example.com");
    const res = await app.request(`/api/documents/${crypto.randomUUID()}`, { headers: await authHeader(userId, "borrower") }, env);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/documents.spec.ts
```

Expected: the new route tests fail (404 from Hono — route not mounted yet).

- [ ] **Step 3: Implement `api/src/routes/documents.ts`**

```ts
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import type { Bindings, Variables } from "../types";

type DocumentRow = {
  id: string;
  user_id: string;
  document_type: string;
  reference_id: string | null;
  r2_key: string;
  created_at: string;
};

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>();

documents.get("/", requireAuth, async (c) => {
  const isStaff = c.var.role === "officer" || c.var.role === "admin";
  const filterUserId = c.req.query("userId");

  let query = "SELECT id, user_id, document_type, reference_id, created_at FROM documents";
  const binds: unknown[] = [];

  if (!isStaff) {
    query += " WHERE user_id = ?";
    binds.push(c.var.userId);
  } else if (filterUserId) {
    query += " WHERE user_id = ?";
    binds.push(filterUserId);
  }
  query += " ORDER BY created_at DESC";

  const { results } = await c.env.DB.prepare(query).bind(...binds).all<DocumentRow>();
  return c.json({
    documents: results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      documentType: r.document_type,
      referenceId: r.reference_id,
      createdAt: r.created_at,
    })),
  });
});

documents.get("/:id", requireAuth, async (c) => {
  const docId = c.req.param("id");
  const isStaff = c.var.role === "officer" || c.var.role === "admin";

  const row = await c.env.DB.prepare(
    "SELECT user_id, r2_key FROM documents WHERE id = ?"
  ).bind(docId).first<{ user_id: string; r2_key: string }>();

  if (!row) return c.json({ error: "Document not found" }, 404);
  if (!isStaff && row.user_id !== c.var.userId) return c.json({ error: "Forbidden" }, 403);

  const object = await c.env.DOCS_BUCKET.get(row.r2_key);
  if (!object) return c.json({ error: "Document not found" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${docId}.pdf"`,
    },
  });
});

export default documents;
```

- [ ] **Step 4: Mount the route in `api/src/index.ts`**

Read the current file then add `import documents` and `app.route("/api/documents", documents)`. The current `index.ts` is:

```ts
import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import plaid from "./routes/plaid";
import profile from "./routes/profile";
import payments from "./routes/payments";
import config from "./routes/config";
import docs from "./routes/docs";
import webhooks from "./routes/webhooks";
import type { Bindings, Variables } from "./types";
import openApiSpec from "../openapi.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/plaid", plaid);
app.route("/api/profile", profile);
app.route("/api/payments", payments);
app.route("/api/config", config);
app.route("/api/webhooks", webhooks);
app.route("/docs", docs);
app.get("/", (c) => c.redirect("/docs"));
app.get("/openapi.json", (c) => c.json(openApiSpec));
export default app;
```

Replace it with:

```ts
import { Hono } from "hono";
import health from "./routes/health";
import auth from "./routes/auth";
import loans from "./routes/loans";
import plaid from "./routes/plaid";
import profile from "./routes/profile";
import payments from "./routes/payments";
import config from "./routes/config";
import docs from "./routes/docs";
import webhooks from "./routes/webhooks";
import documents from "./routes/documents";
import type { Bindings, Variables } from "./types";
import openApiSpec from "../openapi.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/loans", loans);
app.route("/api/plaid", plaid);
app.route("/api/profile", profile);
app.route("/api/payments", payments);
app.route("/api/config", config);
app.route("/api/webhooks", webhooks);
app.route("/api/documents", documents);
app.route("/docs", docs);
app.get("/", (c) => c.redirect("/docs"));
app.get("/openapi.json", (c) => c.json(openApiSpec));
export default app;
```

- [ ] **Step 5: Run all documents tests**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/documents.spec.ts
```

Expected: all tests pass (store + route tests).

- [ ] **Step 6: Commit**

```bash
cd /home/yasser/Desktop/Big-5/microloans
git add api/src/routes/documents.ts api/src/index.ts api/test/documents.spec.ts
git commit -m "feat: GET /api/documents and GET /api/documents/:id with role-based access"
```

---

## Task 5: Hook — Register Generates Account-Opened Document

**Files:**
- Modify: `api/src/routes/auth.ts`
- Modify: `api/test/auth.spec.ts` (add assertion that `documentId` is in the register response and the R2 object exists)

**Interfaces:**
- Consumes: `generateAccountOpenedPdf` from `../documents/generator`; `saveDocument` from `../documents/store`; `c.env.DOCS_BUCKET`
- Produces: `POST /api/auth/register` response now includes `documentId: string`

- [ ] **Step 1: Add register document assertion to `api/test/auth.spec.ts`**

Read the current `api/test/auth.spec.ts`, then add this test inside (or after) the existing `POST /api/auth/register` describe block:

```ts
it("generates an account-opened document and returns its ID", async () => {
  const res = await app.request(
    "/api/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "doc-register@example.com",
        password: "Pass1234!",
        turnstileToken: "valid",
      }),
    },
    env
  );

  expect(res.status).toBe(201);
  const body = await res.json<{ id: string; documentId: string }>();
  expect(typeof body.documentId).toBe("string");

  // Row in documents table
  const row = await env.DB.prepare("SELECT document_type FROM documents WHERE id = ?")
    .bind(body.documentId).first<{ document_type: string }>();
  expect(row?.document_type).toBe("account_opened");

  // PDF in R2
  const r2Key = `documents/${body.id}/account_opened/${body.documentId}.pdf`;
  const obj = await env.DOCS_BUCKET.head(r2Key);
  expect(obj).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/auth.spec.ts -t "generates an account-opened"
```

Expected: FAIL — `documentId` is undefined.

- [ ] **Step 3: Update `api/src/routes/auth.ts`**

Replace the entire file:

```ts
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";
import { verifyTurnstile } from "../middleware/turnstile";
import { requireAuth } from "../middleware/requireAuth";
import { generateAccountOpenedPdf } from "../documents/generator";
import { saveDocument } from "../documents/store";
import type { Bindings, Variables } from "../types";

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const email = body.email.toLowerCase();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'borrower')"
  )
    .bind(id, email, passwordHash)
    .run();

  const docId = crypto.randomUUID();
  const pdfBytes = await generateAccountOpenedPdf({ docId, userId: id, email, createdAt: new Date().toISOString() });
  await saveDocument(c.env.DB, c.env.DOCS_BUCKET, { id: docId, userId: id, documentType: "account_opened", pdfBytes });

  return c.json({ id, email, documentId: docId }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string; turnstileToken: string }>();

  const email = body.email.toLowerCase();

  const passed = await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
  if (!passed) {
    return c.json({ error: "Turnstile verification failed" }, 403);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, role FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{ id: string; password_hash: string; role: "borrower" | "officer" | "admin" }>();

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signJwt({ sub: user.id, role: user.role }, c.env.JWT_SECRET, 3600);
  return c.json({ token });
});

auth.post("/logout", requireAuth, async (c) => {
  const jti = c.var.jti;
  const exp = c.var.exp;
  const ttl = exp - Math.floor(Date.now() / 1000);

  if (ttl >= 60) {
    await c.env.LOAN_CACHE.put(`blacklist:${jti}`, "1", { expirationTtl: ttl });
  }

  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const userId = c.var.userId;
  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ userId, email: user.email, role: c.var.role });
});

export default auth;
```

- [ ] **Step 4: Run the auth tests**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/auth.spec.ts
```

Expected: all auth tests pass including the new document assertion.

- [ ] **Step 5: Commit**

```bash
cd /home/yasser/Desktop/Big-5/microloans
git add api/src/routes/auth.ts api/test/auth.spec.ts
git commit -m "feat: generate account_opened PDF on register"
```

---

## Task 6: Hook — Loan Approve and Installment Pay Generate Documents

**Files:**
- Modify: `api/src/routes/loans.ts`
- Modify: `api/test/loans.spec.ts` (add documentId assertions to approve and pay tests)

**Interfaces:**
- Consumes: `generateLoanAgreementPdf`, `generatePaymentReceiptPdf` from `../documents/generator`; `saveDocument` from `../documents/store`; `c.env.DOCS_BUCKET`
- Produces:
  - `POST /api/loans/:id/approve` response includes `documentId: string`
  - `POST /api/loans/:id/installments/:installmentId/pay` response includes `documentId: string`

- [ ] **Step 1: Add document assertions to the approve test in `api/test/loans.spec.ts`**

In the existing `"activates the loan, creates installments, and records a disbursement"` test, after `expect(approveBody.installmentCount).toBe(6)` add:

```ts
expect(typeof approveBody.documentId).toBe("string");
const loanDocRow = await env.DB.prepare(
  "SELECT document_type, reference_id FROM documents WHERE id = ?"
).bind(approveBody.documentId).first<{ document_type: string; reference_id: string }>();
expect(loanDocRow?.document_type).toBe("loan_agreement");
expect(loanDocRow?.reference_id).toBe(loanId);
```

- [ ] **Step 2: Add document assertion to the pay test in `api/test/loans.spec.ts`**

In the existing `"marks an installment paid and records a repayment transaction"` test, after `expect(body.status).toBe("paid")` add:

```ts
expect(typeof body.documentId).toBe("string");
const payDocRow = await env.DB.prepare(
  "SELECT document_type FROM documents WHERE id = ?"
).bind(body.documentId).first<{ document_type: string }>();
expect(payDocRow?.document_type).toBe("payment_receipt");
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/loans.spec.ts -t "activates the loan"
```

Expected: FAIL — `documentId` is undefined.

- [ ] **Step 4: Update `api/src/routes/loans.ts`**

Replace the entire file:

```ts
import { Hono } from "hono";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateInstallments } from "../loans/amortization";
import { getPlaidItem } from "../plaid/items";
import { behaviorScore, finalScore, THRESHOLD, type BehaviorHistory } from "../plaid/scoring";
import { generateLoanAgreementPdf, generatePaymentReceiptPdf } from "../documents/generator";
import { saveDocument } from "../documents/store";
import type { Bindings, Variables } from "../types";

const FLAT_INTEREST_RATE = 0.05;
const UPFRONT_THRESHOLD = 5000;
const UPFRONT_PCT = 0.05;

const loans = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function loadBehaviorHistory(
  db: D1Database,
  userId: string
): Promise<BehaviorHistory> {
  const profile = await db
    .prepare("SELECT kyc_status FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ kyc_status: "pending" | "approved" | "rejected" }>();

  const counts = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'fully_paid' THEN 1 ELSE 0 END), 0) AS fully_paid,
         COALESCE(SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END), 0) AS defaulted
       FROM loans WHERE borrower_id = ?`
    )
    .bind(userId)
    .first<{ fully_paid: number; defaulted: number }>();

  const overdue = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM installments i
         JOIN loans l ON l.id = i.loan_id
       WHERE l.borrower_id = ? AND i.status = 'overdue'`
    )
    .bind(userId)
    .first<{ n: number }>();

  return {
    kycStatus: profile?.kyc_status ?? "pending",
    fullyPaidCount: counts?.fully_paid ?? 0,
    defaultedCount: counts?.defaulted ?? 0,
    overdueInstallmentCount: overdue?.n ?? 0,
  };
}

loans.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ amount: number; termMonths: number }>();

  if (body.amount <= 0 || body.termMonths <= 0) {
    return c.json({ error: "amount and termMonths must be positive" }, 400);
  }

  const userId = c.var.userId;

  const bank = await getPlaidItem(c.env.DB, c.env.PII_ENCRYPTION_KEY, userId);
  if (!bank) {
    return c.json({ error: "Bank audit required; connect a bank via /api/plaid/connect first" }, 428);
  }

  const history = await loadBehaviorHistory(c.env.DB, userId);
  const behavior = behaviorScore(history);
  const score = finalScore(bank.bankSafetyScore, behavior);
  const summary = JSON.stringify({
    finalScore: score,
    bankSafety: bank.bankSafetyScore,
    behavior,
    weights: { bank: 0.6, behavior: 0.4 },
    threshold: THRESHOLD,
  });

  if (score < THRESHOLD) {
    return c.json({ error: "Risk score below threshold", finalScore: score, summary: JSON.parse(summary) }, 403);
  }

  const upfrontRequired = body.amount > UPFRONT_THRESHOLD;
  const upfrontAmount = upfrontRequired ? Math.round(body.amount * UPFRONT_PCT * 100) / 100 : 0;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO loans (id, borrower_id, amount, interest_rate, term_months, status,
       risk_assessment_score, risk_assessment_summary, upfront_required, upfront_amount)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  )
    .bind(id, userId, body.amount, FLAT_INTEREST_RATE, body.termMonths, score, summary,
      upfrontRequired ? 1 : 0, upfrontAmount)
    .run();

  return c.json({ id, status: "pending", riskScore: score, upfrontRequired, upfrontAmount }, 201);
});

loans.get("/", requireAuth, async (c) => {
  const status = c.req.query("status");
  const isStaff = c.var.role === "officer" || c.var.role === "admin";

  let query = "SELECT * FROM loans";
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (!isStaff) {
    conditions.push("borrower_id = ?");
    binds.push(c.var.userId);
  }
  if (status) {
    conditions.push("status = ?");
    binds.push(status);
  }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC";

  const { results } = await c.env.DB.prepare(query)
    .bind(...binds)
    .all();
  return c.json({ loans: results });
});

loans.get("/:id", requireAuth, async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ?")
    .bind(loanId)
    .first<{ borrower_id: string }>();
  const isStaff = c.var.role === "officer" || c.var.role === "admin";
  if (!loan || (!isStaff && loan.borrower_id !== c.var.userId)) {
    return c.json({ error: "Loan not found" }, 404);
  }

  const { results: installments } = await c.env.DB.prepare(
    "SELECT * FROM installments WHERE loan_id = ? ORDER BY installment_number"
  )
    .bind(loanId)
    .all();

  return c.json({ loan, installments });
});

loans.post("/:id/approve", requireAuth, requireRole("officer", "admin"), async (c) => {
  const loanId = c.req.param("id");

  const loan = await c.env.DB.prepare(
    "SELECT id, borrower_id, amount, interest_rate, term_months, upfront_required, upfront_paid FROM loans WHERE id = ? AND status = 'pending'"
  )
    .bind(loanId)
    .first<{ id: string; borrower_id: string; amount: number; interest_rate: number; term_months: number; upfront_required: number; upfront_paid: number }>();

  if (!loan) {
    return c.json({ error: "Pending loan not found" }, 404);
  }

  if (loan.upfront_required && !loan.upfront_paid) {
    return c.json({ error: "Upfront deposit required before approval" }, 402);
  }

  const schedule = generateInstallments(loan.amount, loan.interest_rate, loan.term_months, new Date());

  const [updateResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE loans SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
    ).bind(c.var.userId, loanId),
    ...schedule.map((installment) =>
      c.env.DB.prepare(
        "INSERT INTO installments (id, loan_id, installment_number, due_date, amount_due) VALUES (?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), loanId, installment.installmentNumber, installment.dueDate, installment.amountDue)
    ),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, loan_id, type, amount, payment_method, status) VALUES (?, ?, 'disbursement', ?, 'mock_gateway', 'completed')"
    ).bind(crypto.randomUUID(), loanId, loan.amount),
  ]);

  if (updateResult.meta.changes === 0) {
    return c.json({ error: "Loan no longer pending" }, 409);
  }

  const docId = crypto.randomUUID();
  const pdfBytes = await generateLoanAgreementPdf({
    docId,
    loanId,
    borrowerId: loan.borrower_id,
    amount: loan.amount,
    interestRate: loan.interest_rate,
    termMonths: loan.term_months,
    schedule,
  });
  await saveDocument(c.env.DB, c.env.DOCS_BUCKET, {
    id: docId,
    userId: loan.borrower_id,
    documentType: "loan_agreement",
    referenceId: loanId,
    pdfBytes,
  });

  return c.json({ id: loanId, status: "active", installmentCount: schedule.length, documentId: docId });
});

loans.post("/:id/reject", requireAuth, requireRole("officer", "admin"), async (c) => {
  const loanId = c.req.param("id");
  const result = await c.env.DB.prepare(
    "UPDATE loans SET status = 'defaulted', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  )
    .bind(c.var.userId, loanId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Pending loan not found" }, 404);
  }
  return c.json({ id: loanId, status: "defaulted" });
});

loans.post("/:id/installments/:installmentId/pay", requireAuth, async (c) => {
  const loanId = c.req.param("id");
  const installmentId = c.req.param("installmentId");
  const body = await c.req.json<{
    amount: number;
    paymentMethod: "stripe" | "bank_transfer" | "mock_gateway";
  }>();

  const installment = await c.env.DB.prepare(
    `SELECT i.id, i.amount_due, i.amount_paid, i.installment_number, l.borrower_id
     FROM installments i JOIN loans l ON l.id = i.loan_id
     WHERE i.id = ? AND i.loan_id = ?`
  )
    .bind(installmentId, loanId)
    .first<{ id: string; amount_due: number; amount_paid: number; installment_number: number; borrower_id: string }>();

  if (!installment) {
    return c.json({ error: "Installment not found" }, 404);
  }

  const newAmountPaid = installment.amount_paid + body.amount;
  const newStatus = newAmountPaid >= installment.amount_due ? "paid" : "partial";
  const paidAt = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      newStatus === "paid"
        ? "UPDATE installments SET amount_paid = ?, status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?"
        : "UPDATE installments SET amount_paid = ?, status = ? WHERE id = ?"
    ).bind(newAmountPaid, newStatus, installmentId),
    c.env.DB.prepare(
      "INSERT INTO transactions (id, loan_id, installment_id, type, amount, payment_method, status) VALUES (?, ?, ?, 'repayment', ?, ?, 'completed')"
    ).bind(crypto.randomUUID(), loanId, installmentId, body.amount, body.paymentMethod),
  ]);

  const unpaidCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM installments WHERE loan_id = ? AND status != 'paid'"
  )
    .bind(loanId)
    .first<{ count: number }>();

  if (unpaidCount?.count === 0) {
    await c.env.DB.prepare(
      "UPDATE loans SET status = 'fully_paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(loanId)
      .run();
  }

  const docId = crypto.randomUUID();
  const pdfBytes = await generatePaymentReceiptPdf({
    docId,
    loanId,
    installmentId,
    installmentNumber: installment.installment_number,
    amountPaid: body.amount,
    paymentMethod: body.paymentMethod,
    installmentStatus: newStatus,
    paidAt,
  });
  await saveDocument(c.env.DB, c.env.DOCS_BUCKET, {
    id: docId,
    userId: installment.borrower_id,
    documentType: "payment_receipt",
    referenceId: installmentId,
    pdfBytes,
  });

  return c.json({ installmentId, status: newStatus, documentId: docId });
});

export default loans;
```

- [ ] **Step 5: Run the full loan and document test suites**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run test/loans.spec.ts test/documents.spec.ts test/auth.spec.ts test/documents-generator.spec.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd /home/yasser/Desktop/Big-5/microloans/api && npx vitest run
```

Expected: same pre-existing failures (2 in plaid.spec.ts); all new tests pass.

- [ ] **Step 7: Commit**

```bash
cd /home/yasser/Desktop/Big-5/microloans
git add api/src/routes/loans.ts api/test/loans.spec.ts
git commit -m "feat: generate loan_agreement on approve, payment_receipt on installment pay"
```

---

## Post-Implementation Checklist

- [ ] Apply migration to remote DB: `wrangler d1 migrations apply microloans_db`
- [ ] Create the R2 bucket in production: `wrangler r2 bucket create microloans-documents`
- [ ] `DOCS_BUCKET` is automatically available in production once declared in `wrangler.toml` — no secret needed.
