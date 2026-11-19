import type { DocumentRenderer } from "../application/ports";
import {
  generateAccountOpenedPdf, generateDepositReceiptPdf, generateLoanAgreementPdf, generatePaymentReceiptPdf, generateStatementPdf,
} from "./pdf-generator";

/** Renders documents with pdf-lib in the Keel layout (see pdf-generator.ts). */
export class PdfDocumentRenderer implements DocumentRenderer {
  accountOpened = generateAccountOpenedPdf;
  loanAgreement = generateLoanAgreementPdf;
  paymentReceipt = generatePaymentReceiptPdf;
  depositReceipt = generateDepositReceiptPdf;
  statement = generateStatementPdf;
}
