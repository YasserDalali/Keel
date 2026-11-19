import type { MailTemplate } from "./email";

export type Rendered = { subject: string; html: string; text: string };
type Data = Record<string, unknown>;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const usd = (n: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n) || 0);
const day = (iso: unknown) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const ref = (id: unknown) => String(id ?? "").slice(0, 8).toUpperCase();

/** One message: heading, sentences, optional button. Rendered to Keel-styled HTML and plain text. */
type Message = { subject: string; heading: string; lines: string[]; action?: { label: string; href: string } };

function layout({ heading, lines, action }: Message): string {
  const ink = "#14271F", ink2 = "#5D6963", accent = "#1F7A4D", canvas = "#F7F6F2", surface = "#FDFCFA";
  const font = "'General Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${canvas};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${canvas};padding:32px 16px;font-family:${font};color:${ink};">
<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;font-size:22px;font-weight:600;letter-spacing:-0.03em;color:${ink};">Keel</td></tr>
<tr><td style="background:${surface};border-radius:16px;padding:32px;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${ink};">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:${ink2};">${esc(l)}</p>`).join("\n")}
${action ? `<p style="margin:24px 0 0;"><a href="${esc(action.href)}" style="display:inline-block;background:${accent};color:${canvas};text-decoration:none;font-weight:500;font-size:16px;padding:12px 20px;border-radius:10px;">${esc(action.label)}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${ink2};">Or paste this link into your browser: ${esc(action.href)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:13px;line-height:1.5;color:${ink2};">Keel is a demonstration lending platform.</td></tr>
</table></td></tr></table></body></html>`;
}

const plain = ({ heading, lines, action }: Message) =>
  [heading, "", ...lines, ...(action ? ["", `${action.label}: ${action.href}`] : []), "", "Keel is a demonstration lending platform."].join("\n");

function message(template: MailTemplate, d: Data, appUrl: string): Message {
  const loanLink = (id: unknown) => `${appUrl}/app/loans/${encodeURIComponent(String(id ?? ""))}`;
  switch (template) {
    case "verify_email":
      return {
        subject: "Confirm your email for Keel",
        heading: "Confirm your email",
        lines: ["Confirm this address so we can send you updates about your loans. The link works for 24 hours."],
        action: { label: "Confirm email", href: String(d.link ?? "") },
      };
    case "loan_received":
      return {
        subject: `We received your application for ${usd(d.amount)}`,
        heading: "Application received",
        lines: [`Loan ${ref(d.loanId)}: ${usd(d.amount)} over ${d.termMonths} months.`, "A loan officer reviews it, usually within two business days. We'll email you when there's a decision."],
        action: { label: "View application", href: loanLink(d.loanId) },
      };
    case "loan_approved":
      return {
        subject: `Your loan of ${usd(d.amount)} is approved`,
        heading: "Your loan is approved",
        lines: [`Loan ${ref(d.loanId)}: ${usd(d.amount)} is on its way.`, `Your monthly payment is ${usd(d.monthly)}, first due ${day(d.firstDueDate)}.`],
        action: { label: "See your schedule", href: loanLink(d.loanId) },
      };
    case "loan_declined":
      return {
        subject: "An update on your loan application",
        heading: "We couldn't approve this loan",
        lines: [`Loan ${ref(d.loanId)} for ${usd(d.amount)} wasn't approved this time.`, "You can apply again. Paying other loans on time and keeping your bank connected helps."],
        action: { label: "Open Keel", href: `${appUrl}/app/loans` },
      };
    case "deposit_received":
      return {
        subject: `Deposit of ${usd(d.amount)} received`,
        heading: "Deposit received",
        lines: [`We received your ${usd(d.amount)} deposit for loan ${ref(d.loanId)}.`, "Your application is now with a loan officer."],
        action: { label: "View loan", href: loanLink(d.loanId) },
      };
    case "payment_receipt":
      return {
        subject: `Payment received: ${usd(d.amount)}`,
        heading: "Payment received",
        lines: [`Payment ${d.number} of ${d.count} on loan ${ref(d.loanId)}: ${usd(d.amount)}.`, `Still to repay: ${usd(d.remaining)}. Your receipt is in My statements.`],
        action: { label: "View loan", href: loanLink(d.loanId) },
      };
    case "payment_reminder": {
      const n = Number(d.daysUntil);
      const when = n < 0 ? `was due ${day(d.dueDate)}` : n === 0 ? "is due today" : `is due ${day(d.dueDate)}`;
      return {
        subject: n < 0 ? `Payment overdue: ${usd(d.amount)}` : `Payment due ${n === 0 ? "today" : day(d.dueDate)}: ${usd(d.amount)}`,
        heading: n < 0 ? "A payment is overdue" : "A payment is coming up",
        lines: [`Payment ${d.number} on loan ${ref(d.loanId)} (${usd(d.amount)}) ${when}.`],
        action: { label: "Pay now", href: loanLink(d.loanId) },
      };
    }
  }
}

export function render(template: MailTemplate, data: Data, appUrl: string): Rendered {
  const m = message(template, data, appUrl);
  return { subject: m.subject, html: layout(m), text: plain(m) };
}
