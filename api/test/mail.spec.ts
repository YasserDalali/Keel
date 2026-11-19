import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { sendTemplate } from "../src/contexts/communication/infrastructure/send-template";

const outbox = (id: string) =>
  env.DB.prepare("SELECT to_address, template, subject, html, text, status, error FROM email_outbox WHERE user_id = ? ORDER BY created_at DESC")
    .bind(id)
    .all<{ to_address: string; template: string; subject: string; html: string; text: string; status: string; error: string | null }>();

const noTransport = { ...env, RESEND_API_KEY: undefined, MAIL_FROM: undefined };
const withResend = { ...env, RESEND_API_KEY: "re_test", MAIL_FROM: "Keel <hello@mail.test>" };
const resend = () => fetchMock.get("https://api.resend.com");

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("sendTemplate", () => {
  it("records a logged email when no transport is configured", async () => {
    const uid = crypto.randomUUID();
    await sendTemplate(noTransport, uid, "amina@example.com", "loan_approved", { loanId: "abcd1234-0000", amount: 2400, monthly: 210, firstDueDate: "2026-12-17" });
    const { results } = await outbox(uid);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ to_address: "amina@example.com", template: "loan_approved", status: "logged", error: null });
    expect(results[0].subject).toMatch(/approved/i);
    expect(results[0].html).toContain("$2,400");
    expect(results[0].text).toContain("$210");
  });

  it("escapes interpolated values in HTML", async () => {
    const uid = crypto.randomUUID();
    await sendTemplate(noTransport, uid, "x@example.com", "verify_email", { link: 'https://x.test/?a="><script>alert(1)</script>' });
    const { results } = await outbox(uid);
    expect(results[0].html).not.toContain("<script>");
    expect(results[0].html).toContain("&lt;script&gt;");
  });

  it("sends through Resend when RESEND_API_KEY is set", async () => {
    const uid = crypto.randomUUID();
    let sent: Record<string, unknown> = {};
    let auth = "";
    resend()
      .intercept({ method: "POST", path: "/emails" })
      .reply(200, (opts) => {
        sent = JSON.parse(String(opts.body));
        auth = new Headers(opts.headers as HeadersInit).get("authorization") ?? "";
        return { id: "re_1" };
      });
    await sendTemplate(withResend, uid, "b@example.com", "loan_declined", { loanId: "l1", amount: 900 });
    expect(auth).toBe("Bearer re_test");
    expect(sent).toMatchObject({ from: "Keel <hello@mail.test>", to: ["b@example.com"] });
    expect(typeof sent.html).toBe("string");
    expect(typeof sent.text).toBe("string");
    expect((await outbox(uid)).results[0].status).toBe("sent");
  });

  it("falls back to Resend's test sender when MAIL_FROM is missing", async () => {
    const uid = crypto.randomUUID();
    let from = "";
    resend().intercept({ method: "POST", path: "/emails" }).reply(200, (opts) => {
      from = JSON.parse(String(opts.body)).from;
      return { id: "re_2" };
    });
    await sendTemplate({ ...withResend, MAIL_FROM: undefined }, uid, "d@example.com", "verify_email", { link: "https://x.test/v" });
    expect(from).toBe("Keel <onboarding@resend.dev>");
  });

  it("never throws: a rejected send is recorded as failed with Resend's reason", async () => {
    const uid = crypto.randomUUID();
    resend().intercept({ method: "POST", path: "/emails" }).reply(403, { message: "The domain is not verified" });
    await expect(
      sendTemplate(withResend, uid, "c@example.com", "payment_receipt", { loanId: "l1", number: 1, count: 6, amount: 525, remaining: 2625 }),
    ).resolves.toBeUndefined();
    const row = (await outbox(uid)).results[0];
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/domain is not verified/);
  });
});
