import type { DeliveryResult, EmailOutbox, EmailSender, OutgoingEmail } from "../domain/email";

/** Delivers through Resend. Without an API key nothing is sent and the result is "logged" (the outbox still records it). */
export class ResendEmailSender implements EmailSender {
  constructor(private readonly apiKey: string | undefined, private readonly from: string | undefined) {}

  async deliver(email: OutgoingEmail): Promise<DeliveryResult> {
    if (!this.apiKey) return { status: "logged", error: null };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        // Without a verified domain, Resend's test sender only delivers to the Resend account's own address.
        body: JSON.stringify({ from: this.from || "Keel <onboarding@resend.dev>", to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      });
      if (res.ok) return { status: "sent", error: null };
      return { status: "failed", error: `Resend ${res.status}: ${(await res.text()).slice(0, 500)}` };
    } catch (e) {
      return { status: "failed", error: (e as Error).message || String(e) };
    }
  }
}

export class D1EmailOutbox implements EmailOutbox {
  constructor(private readonly db: D1Database) {}

  async record(e: Parameters<EmailOutbox["record"]>[0]): Promise<void> {
    await this.db
      .prepare("INSERT INTO email_outbox (id, user_id, to_address, template, subject, html, text, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), e.userId, e.to, e.template, e.subject, e.html, e.text, e.status, e.error)
      .run();
  }

  async recentFor(userId: string, limit: number) {
    const { results } = await this.db
      .prepare("SELECT id, template, subject, html, created_at FROM email_outbox WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .bind(userId, limit)
      .all<{ id: string; template: string; subject: string; html: string; created_at: string }>();
    return results.map((r) => ({ id: r.id, template: r.template, subject: r.subject, html: r.html, createdAt: r.created_at }));
  }
}
