import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, http } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../ui/Button";
import { DemoButton, useDemo } from "../ui/DemoFill";
import { Dialog } from "../ui/Dialog";

/** "Send a new link" with the 60-second cooldown the API enforces. */
export function ResendButton({ size = "md" }: { size?: "md" | "lg" }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "wait" | "error">("idle");
  async function resend() {
    setState("busy");
    try {
      await http("/auth/resend-verification", { method: "POST" });
      setState("sent");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 429 ? "wait" : "error");
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button variant="secondary" size={size} loading={state === "busy"} onClick={resend} disabled={state === "sent"}>
        {state === "sent" ? "Link sent" : "Send a new link"}
      </Button>
      <span className="text-small text-ink-2" aria-live="polite">
        {state === "wait" && "Wait a minute before asking again."}
        {state === "error" && "That didn't send. Try again in a minute."}
      </span>
    </span>
  );
}

type OutboxEmail = { id: string; template: string; subject: string; html: string; createdAt: string };

/** Top-of-app bar until the email is confirmed. In demo mode it can open the "sent" email or skip the step. */
export function EmailBanner() {
  const { user, refresh } = useAuth();
  const demo = useDemo();
  const navigate = useNavigate();
  const [mail, setMail] = useState<OutboxEmail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  if (!user || user.emailVerified !== false) return null;

  async function openEmail() {
    setNote("");
    try {
      const { emails } = await http<{ emails: OutboxEmail[] }>("/demo/outbox");
      const latest = emails.find((e) => e.template === "verify_email");
      if (latest) setMail(latest);
      else setNote("No verification email yet. Send a new link first.");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function verifyNow() {
    setBusy(true);
    try {
      await http("/demo/verify-email", { method: "POST" });
      await refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // the email's own link, so the demo can follow it in this tab instead of inside the preview frame
  const link = mail?.html.match(/href="([^"]*\/verify-email\?token=[^"]+)"/)?.[1]?.replace(/&amp;/g, "&");

  return (
    <div role="status" className="border-b border-warning/25 bg-[color-mix(in_oklab,var(--color-warning)_8%,var(--color-canvas))] print:hidden">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <p className="text-small text-ink">
          <span className="font-medium">Confirm your email to apply.</span>{" "}
          <span className="text-ink-2">We sent a link to {user.email}.</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ResendButton />
          {demo && (
            <>
              <DemoButton label="Open the email" onClick={openEmail} />
              <DemoButton label="Verify now" onClick={verifyNow} busy={busy} />
            </>
          )}
          {note && <span className="text-small text-ink-2">{note}</span>}
        </div>
      </div>

      <Dialog open={!!mail} onClose={() => setMail(null)} title={mail?.subject ?? "Email"}>
        <iframe title="Verification email" sandbox="" srcDoc={mail?.html} className="h-[420px] w-full rounded-control border border-line bg-surface" />
        {link && (
          <Button
            className="self-end"
            onClick={() => {
              const u = new URL(link, location.origin);
              setMail(null);
              navigate(u.pathname + u.search);
            }}
          >
            Follow the link
          </Button>
        )}
      </Dialog>
    </div>
  );
}
