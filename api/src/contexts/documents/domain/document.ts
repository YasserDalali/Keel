import { DomainError } from "../../../shared/errors";

export type DocumentType = "account_opened" | "loan_agreement" | "payment_receipt" | "deposit_receipt" | "statement";

/** A stored PDF as people see it in their statements list. */
export type DocumentSummary = {
  id: string;
  ownerId: string;
  type: DocumentType | string;
  /** Receipts point at an installment, agreements and deposit receipts at a loan, statements at a month ("YYYY-MM"). */
  referenceId: string | null;
  storageKey: string;
  createdAt: string;
  title: string;
  loanId: string | null;
  amount: number | null;
};

export type NewDocument = { id: string; ownerId: string; type: DocumentType; referenceId?: string };

export interface DocumentRepository {
  add(doc: NewDocument, pdf: Uint8Array): Promise<void>;
  /** The owner and the PDF bytes, or null when the document or its file is missing. */
  contentOf(id: string): Promise<{ ownerId: string; pdf: ArrayBuffer } | null>;
}

/** Read side: lists shaped for the screen (titles, loan and amount resolved), not aggregates. */
export interface DocumentQueries {
  list(ownerId?: string): Promise<DocumentSummary[]>;
  byId(id: string): Promise<DocumentSummary | null>;
}

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** What a document is called in the list. */
export function documentTitle(type: string, referenceId: string | null, installmentNumber: number | null, installmentCount: number | null): string {
  switch (type) {
    case "loan_agreement": return "Loan agreement";
    case "deposit_receipt": return "Deposit receipt";
    case "account_opened": return "Account opened";
    case "statement": return referenceId ? `Statement · ${monthLabel(referenceId)}` : "Statement";
    case "payment_receipt": return installmentNumber ? `Receipt · payment ${installmentNumber} of ${installmentCount}` : "Payment receipt";
    default: return type;
  }
}

export class DocumentNotFound extends DomainError {
  constructor() { super("document_not_found", "Not found"); }
}
export class DocumentForbidden extends DomainError {
  constructor() { super("document_forbidden", "Forbidden"); }
}
