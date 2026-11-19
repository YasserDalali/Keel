import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts, type RGB } from "pdf-lib";
import type { StatementData } from "../domain/statement";

export type { StatementData };

// Keel tokens (frontend/src/styles/tokens.css), as PDF colours.
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#14271F");
const INK2 = hex("#5D6963");
const INK3 = hex("#78827C");
const LINE = hex("#E2E5E3"); // ink at ~10% on canvas
const CANVAS = hex("#F7F6F2");
const SURFACE = hex("#FDFCFA");
const ACCENT = hex("#1F7A4D");
const MINT = hex("#7FD1AE");
const MINT50 = hex("#D8EFE2");

const W = 595.28; // A4
const H = 841.89;
const M = 48;
const BOTTOM = 72; // content stops above the footer

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (n: number) => money.format(n);
const longDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
};
const ref = (id: string) => id.slice(0, 8).toUpperCase();

type Fonts = { regular: PDFFont; bold: PDFFont };

/** A PDF in the Keel layout: canvas header band with the mark, a running cursor, automatic pages, and a footer on each page. */
class Doc {
  private page!: PDFPage;
  y = 0;
  private constructor(private doc: PDFDocument, private f: Fonts, private kind: string, private docId: string) {}

  static async create(kind: string, docId: string, title: string, subtitle?: string) {
    const doc = await PDFDocument.create();
    doc.setTitle(`Keel · ${title}`);
    doc.setAuthor("Keel");
    const f = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const d = new Doc(doc, f, kind, docId);
    d.newPage(title, subtitle);
    return d;
  }

  private newPage(title?: string, subtitle?: string) {
    this.page = this.doc.addPage([W, H]);
    const band = title ? 168 : 72;
    this.page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: CANVAS });
    // Keel mark (frontend Wordmark paths, 32-unit box) + name
    const s = 0.75;
    const top = H - 30;
    this.page.drawSvgPath("M17 3c5.5 3 8.5 8 8.5 14H17z", { x: M, y: top, scale: s, color: MINT });
    this.page.drawSvgPath("M15 7c-3.6 2.4-5.8 6-6.4 10H15z", { x: M, y: top, scale: s, color: ACCENT });
    this.page.drawSvgPath("M3 19h26c-1 5.5-6.5 9-13 9S4 24.5 3 19z", { x: M, y: top, scale: s, color: INK });
    this.text("Keel", M + 28, top - 17, 15, { bold: true });
    this.right(this.kind.toUpperCase(), W - M, top - 15, 8, { bold: true, color: INK2 });
    if (title) {
      this.text(title, M, H - 112, 28, { bold: true });
      if (subtitle) this.text(subtitle, M, H - 136, 11, { color: INK2 });
    }
    this.y = H - band - 36;
  }

  /** Start a new page when fewer than `h` points remain. */
  need(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  text(t: string, x: number, y: number, size: number, o: { bold?: boolean; color?: RGB } = {}) {
    this.page.drawText(t, { x, y, size, font: o.bold ? this.f.bold : this.f.regular, color: o.color ?? INK });
  }

  width(t: string, size: number, bold = false) {
    return (bold ? this.f.bold : this.f.regular).widthOfTextAtSize(t, size);
  }

  right(t: string, xRight: number, y: number, size: number, o: { bold?: boolean; color?: RGB } = {}) {
    this.text(t, xRight - this.width(t, size, o.bold), y, size, o);
  }

  rule(y = this.y, color = LINE) {
    this.page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color });
  }

  /** Section heading with a hairline under it. */
  heading(t: string) {
    this.need(48);
    this.text(t, M, this.y, 13, { bold: true });
    this.y -= 12;
    this.rule();
    this.y -= 20;
  }

  /** Label / value pairs in two columns. */
  facts(rows: [string, string][]) {
    const colW = (W - 2 * M) / 2;
    for (let i = 0; i < rows.length; i += 2) {
      this.need(36);
      rows.slice(i, i + 2).forEach(([label, value], j) => {
        const x = M + j * colW;
        this.text(label, x, this.y, 8.5, { color: INK2 });
        this.text(value, x, this.y - 15, 11.5);
      });
      this.y -= 38;
    }
  }

  /** Mint panel with one big figure: the thing this document is about. */
  highlight(label: string, value: string, note?: string) {
    const h = note ? 86 : 70;
    this.need(h + 16);
    this.page.drawRectangle({ x: M, y: this.y - h + 12, width: W - 2 * M, height: h, color: MINT50 });
    this.text(label, M + 18, this.y - 8, 9, { color: INK2 });
    this.text(value, M + 18, this.y - 38, 26, { bold: true, color: ACCENT });
    if (note) this.text(note, M + 18, this.y - 58, 9.5, { color: INK2 });
    this.y -= h + 18;
  }

  /** Simple table: column headers, hairline rows, right-aligned columns marked with `align: "right"`. */
  table(cols: { label: string; x: number; align?: "right" }[], rows: string[][], emptyText = "Nothing to show.") {
    const head = () => {
      this.need(40);
      cols.forEach((c) => (c.align === "right" ? this.right(c.label.toUpperCase(), c.x, this.y, 7.5, { bold: true, color: INK2 }) : this.text(c.label.toUpperCase(), c.x, this.y, 7.5, { bold: true, color: INK2 })));
      this.y -= 9;
      this.rule(this.y, INK3);
      this.y -= 16;
    };
    head();
    if (!rows.length) {
      this.text(emptyText, M, this.y, 10, { color: INK2 });
      this.y -= 24;
      return;
    }
    for (const r of rows) {
      if (this.y - 22 < BOTTOM) {
        this.newPage();
        head();
      }
      r.forEach((cell, i) => (cols[i].align === "right" ? this.right(cell, cols[i].x, this.y, 10) : this.text(cell, cols[i].x, this.y, 10)));
      this.y -= 8;
      this.rule();
      this.y -= 14;
    }
    this.y -= 8;
  }

  note(t: string) {
    this.need(30);
    this.text(t, M, this.y, 8.5, { color: INK2 });
    this.y -= 16;
  }

  async save() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: 48 }, end: { x: W - M, y: 48 }, thickness: 0.6, color: LINE });
      p.drawText("Keel · demonstration lending platform", { x: M, y: 32, size: 7.5, font: this.f.regular, color: INK3 });
      const right = `Document ${ref(this.docId)} · Page ${i + 1} of ${pages.length}`;
      p.drawText(right, { x: W - M - this.f.regular.widthOfTextAtSize(right, 7.5), y: 32, size: 7.5, font: this.f.regular, color: INK3 });
    });
    return this.doc.save();
  }
}

const COLS3 = (a: string, b: string, c: string) => [
  { label: a, x: M },
  { label: b, x: M + 150 },
  { label: c, x: W - M, align: "right" as const },
];

export async function generateAccountOpenedPdf(data: { docId: string; userId: string; email: string; createdAt: string }): Promise<Uint8Array> {
  const d = await Doc.create("Account", data.docId, "Welcome to Keel", "Your account is open.");
  d.facts([
    ["Account", ref(data.userId)],
    ["Email", data.email],
    ["Opened", longDate(data.createdAt)],
    ["Next step", "Verify your ID and connect a bank"],
  ]);
  return d.save();
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
  const total = Math.round(data.amount * (1 + data.interestRate) * 100) / 100;
  const monthly = data.schedule[0]?.amountDue ?? 0;
  const d = await Doc.create("Loan agreement", data.docId, "Loan agreement", `Loan ${ref(data.loanId)} · ${longDate(new Date().toISOString())}`);
  d.highlight("You receive", usd(data.amount), `Repay ${usd(total)} in ${data.termMonths} monthly payments of about ${usd(monthly)}.`);
  d.heading("Terms");
  d.facts([
    ["Principal", usd(data.amount)],
    ["Fee", `${usd(Math.round((total - data.amount) * 100) / 100)} · ${Math.round(data.interestRate * 100)}% flat, charged once`],
    ["Total to repay", usd(total)],
    ["Term", `${data.termMonths} months`],
    ["Borrower", ref(data.borrowerId)],
    ["Disbursed", longDate(new Date().toISOString())],
  ]);
  d.heading("Repayment schedule");
  d.table(COLS3("Payment", "Due date", "Amount"), data.schedule.map((r) => [`${r.installmentNumber} of ${data.schedule.length}`, longDate(r.dueDate), usd(r.amountDue)]));
  d.note("Paying early is always allowed and costs nothing extra. The fee does not grow over time.");
  d.note("This agreement is generated by a demonstration platform and is not a binding credit contract.");
  return d.save();
}

const METHOD: Record<string, string> = { stripe: "Card (Stripe)", paypal: "PayPal", bank_transfer: "Bank transfer", mock_gateway: "Demo payment", demo: "Demo payment" };

export async function generatePaymentReceiptPdf(data: {
  docId: string;
  loanId: string;
  installmentId: string;
  installmentNumber: number;
  amountPaid: number;
  paymentMethod: string;
  installmentStatus: string;
  paidAt: string;
  installmentCount?: number;
  loanRemaining?: number;
}): Promise<Uint8Array> {
  const of = data.installmentCount ? ` of ${data.installmentCount}` : "";
  const d = await Doc.create("Receipt", data.docId, "Payment receipt", `Loan ${ref(data.loanId)} · ${longDate(data.paidAt)}`);
  d.highlight("Amount paid", usd(data.amountPaid), data.loanRemaining === undefined ? undefined : data.loanRemaining > 0 ? `${usd(data.loanRemaining)} left to repay on this loan.` : "This loan is now paid off.");
  d.heading("Details");
  d.facts([
    ["Payment", `${data.installmentNumber}${of}`],
    ["Status", data.installmentStatus === "paid" ? "Paid in full" : "Part paid"],
    ["Method", METHOD[data.paymentMethod] ?? data.paymentMethod],
    ["Date", longDate(data.paidAt)],
    ["Loan", ref(data.loanId)],
    ["Receipt", ref(data.docId)],
  ]);
  return d.save();
}

export async function generateDepositReceiptPdf(data: { docId: string; loanId: string; amount: number; loanAmount: number; method: string; paidAt: string }): Promise<Uint8Array> {
  const d = await Doc.create("Receipt", data.docId, "Deposit receipt", `Loan ${ref(data.loanId)} · ${longDate(data.paidAt)}`);
  d.highlight("Deposit paid", usd(data.amount), `5% upfront on a ${usd(data.loanAmount)} loan. A loan officer can now approve it.`);
  d.heading("Details");
  d.facts([
    ["Loan", ref(data.loanId)],
    ["Method", METHOD[data.method] ?? data.method],
    ["Date", longDate(data.paidAt)],
    ["Receipt", ref(data.docId)],
  ]);
  return d.save();
}

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const STATUS: Record<string, string> = { pending: "With a loan officer", under_review: "With a loan officer", approved: "Repaying", active: "Repaying", fully_paid: "Paid off", defaulted: "Closed" };
const TX: Record<string, string> = { disbursement: "Money received", repayment: "Payment", deposit: "Deposit", fee: "Fee" };

export async function generateStatementPdf(data: StatementData): Promise<Uint8Array> {
  const d = await Doc.create("Statement", data.docId, `Statement · ${monthLabel(data.month)}`, `${data.holder.name ? `${data.holder.name} · ` : ""}${data.holder.email}`);
  d.highlight("Paid this month", usd(data.summary.paidInMonth), `${usd(data.summary.outstanding)} still owed across ${data.summary.activeLoans} active ${data.summary.activeLoans === 1 ? "loan" : "loans"}, ${data.summary.paymentsLeft} payments to go.`);
  d.heading("Loans");
  d.table(
    [{ label: "Loan", x: M }, { label: "Status", x: M + 90 }, { label: "Amount", x: M + 290, align: "right" }, { label: "Repaid", x: M + 390, align: "right" }, { label: "Still owed", x: W - M, align: "right" }],
    data.loans.map((l) => [ref(l.id), STATUS[l.status] ?? l.status, usd(l.amount), usd(l.repaid), usd(l.outstanding)]),
    "No loans yet.",
  );
  d.heading(`Activity in ${monthLabel(data.month)}`);
  d.table(
    [{ label: "Date", x: M }, { label: "What", x: M + 110 }, { label: "Loan", x: M + 280 }, { label: "Amount", x: W - M, align: "right" }],
    data.transactions.map((t) => [longDate(t.date), TX[t.type] ?? t.type, ref(t.loanId), `${t.type === "disbursement" ? "+" : "-"}${usd(t.amount)}`]),
    "No money moved this month.",
  );
  d.heading("Coming up");
  d.table(COLS3("Due date", "Loan", "Amount"), data.upcoming.map((u) => [longDate(u.dueDate), ref(u.loanId), usd(u.amount)]), "Nothing due.");
  return d.save();
}
