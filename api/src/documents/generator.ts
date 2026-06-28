import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from "pdf-lib";

const NAVY = rgb(0.106, 0.227, 0.420);
const GOLD = rgb(0.788, 0.659, 0.298);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.15, 0.15, 0.15);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.95);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;

async function basePdf(docTitle: string): Promise<{
  doc: PDFDocument;
  page: PDFPage;
  bold: PDFFont;
  regular: PDFFont;
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

function drawFooter(page: PDFPage, regular: PDFFont, docId: string): void {
  page.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: PAGE_W - MARGIN, y: 50 }, thickness: 1.5, color: GOLD });
  page.drawText(`Document ID: ${docId}`, { x: MARGIN, y: 32, font: regular, size: 8, color: DARK });
  const genText = `Generated: ${new Date().toISOString().slice(0, 10)}`;
  const genW = regular.widthOfTextAtSize(genText, 8);
  page.drawText(genText, { x: PAGE_W - MARGIN - genW, y: 32, font: regular, size: 8, color: DARK });
}

function drawField(page: PDFPage, bold: PDFFont, regular: PDFFont, label: string, value: string, y: number): void {
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
  page.drawText("#", { x: MARGIN + 4, y, font: bold, size: 10, color: WHITE });
  page.drawText("Due Date", { x: MARGIN + 40, y, font: bold, size: 10, color: WHITE });
  page.drawText("Amount Due", { x: MARGIN + 230, y, font: bold, size: 10, color: WHITE });
  y -= 18;

  for (const row of data.schedule) {
    if (y < 70) break;
    const bg = row.installmentNumber % 2 === 0 ? LIGHT_GRAY : WHITE;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - 2 * MARGIN, height: 16, color: bg });
    page.drawText(String(row.installmentNumber), { x: MARGIN + 4, y, font: regular, size: 10, color: DARK });
    page.drawText(row.dueDate, { x: MARGIN + 40, y, font: regular, size: 10, color: DARK });
    page.drawText(`$${row.amountDue.toFixed(2)}`, { x: MARGIN + 230, y, font: regular, size: 10, color: DARK });
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
