import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { http } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usd } from "../lib/format";
import { date, shortId } from "../lib/loans";
import { useToast, type ToastInput } from "../ui/Toast";
import { BellIcon, useReminders, when } from "./Reminders";

export type Note = { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
type Data = { notifications: Note[]; unread: number };

// One shared poller: every 30 s and whenever the tab regains focus, only while something is subscribed.
let snapshot: Data | null = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const emit = () => subs.forEach((s) => s());
if (typeof window !== "undefined") window.addEventListener("keel:session-reset", () => resetNotifications());

/** Forget the previous account's notifications (sign-in / sign-out). */
export function resetNotifications() {
  snapshot = null;
  emit();
}

export async function refreshNotifications() {
  try {
    snapshot = await http<Data>("/notifications");
    emit();
  } catch {
    /* keep the last snapshot; the bell just shows what it had */
  }
}
const onFocus = () => document.visibilityState !== "hidden" && refreshNotifications();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) {
    refreshNotifications();
    timer = setInterval(refreshNotifications, 30_000);
    addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      clearInterval(timer);
      removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    }
  };
}

export function useNotifications() {
  return useSyncExternalStore(subscribe, () => snapshot, () => null);
}

/** Mark some (or, with no ids, all) notifications read, optimistically. */
export async function markRead(ids?: string[]) {
  if (snapshot) {
    const now = new Date().toISOString();
    const notifications = snapshot.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n));
    snapshot = { notifications, unread: notifications.filter((n) => !n.readAt).length };
    emit();
  }
  await http("/notifications/read", { method: "POST", json: ids ? { ids } : {} }).catch(() => refreshNotifications());
}

// Loans already celebrated in this page session, so the demo-approve toast and the later notification don't both fire.
const celebrated = new Set<string>();
const APPROVED: ToastInput = { title: "Your loan is approved", body: "The money is on its way. Your schedule is ready.", tone: "success", celebrate: true };

export function celebrateApproval(toast: (t: ToastInput) => void, loanId: string) {
  if (celebrated.has(loanId)) return;
  celebrated.add(loanId);
  toast(APPROVED);
}

/** Celebrate each unread `loan_approved` notification once, then mark it read. */
export function useApprovalCelebration() {
  const data = useNotifications();
  const toast = useToast();
  useEffect(() => {
    const fresh = data?.notifications.filter((n) => n.kind === "loan_approved" && !n.readAt) ?? [];
    if (!fresh.length) return;
    for (const n of fresh) {
      const loanId = n.link?.split("/").pop() ?? n.id;
      if (!celebrated.has(loanId)) celebrateApproval(toast, loanId);
    }
    markRead(fresh.map((n) => n.id));
  }, [data, toast]);
}

const ago = (iso: string) => {
  const t = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).getTime();
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return date(iso);
};

/** App-bar bell for every role: server notifications, plus "Coming up" payments for borrowers. Count is text beside the icon. */
export function NotificationBell() {
  const { user } = useAuth();
  const borrower = user?.role === "borrower";
  const data = useNotifications();
  const { data: rem } = useReminders();
  useApprovalCelebration();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  const notes = data?.notifications ?? [];
  const reminders = borrower ? rem?.reminders ?? [] : [];
  const overdue = reminders.some((r) => r.kind === "overdue");
  const count = (data?.unread ?? 0) + reminders.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      wrap.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={count ? `Notifications: ${data?.unread ?? 0} unread${reminders.length ? `, ${reminders.length} payments coming up` : ""}` : "Notifications: none new"}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-1.5 rounded-control px-2 text-ink-2 transition-colors duration-150 hover:text-ink"
      >
        <BellIcon className="size-5" />
        {count > 0 && <span className={`tabular text-small font-medium ${overdue ? "text-danger" : "text-accent-700"}`}>{count}</span>}
      </button>

      {open && (
        <div
          id={id}
          data-lenis-prevent
          className="fixed inset-x-4 top-[72px] z-50 flex max-h-[min(560px,calc(100dvh-96px))] flex-col sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[min(380px,calc(100vw-32px))] overflow-y-auto rounded-art bg-surface p-5 shadow-float-2 animate-[rise_250ms_var(--ease-out-expo)]"
        >
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-label text-ink-2">Notifications</p>
            {(data?.unread ?? 0) > 0 && (
              <button type="button" onClick={() => markRead()} className="rounded-control text-small font-medium text-accent-700 hover:text-accent-800">
                Mark all read
              </button>
            )}
          </div>
          {notes.length ? (
            <ul className="mt-3 flex flex-col">
              {notes.slice(0, 8).map((n) => (
                <li key={n.id} className="border-t border-line first:border-t-0">
                  <NoteRow note={n} onOpen={() => { close(); if (!n.readAt) markRead([n.id]); }} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-body text-ink-2">{data ? "Nothing new. Updates about your loans show up here." : "Loading…"}</p>
          )}

          {borrower && (
            <>
              <p className="mt-5 border-t border-line pt-4 text-label text-ink-2">Coming up</p>
              {reminders.length ? (
                <ul className="mt-2 flex flex-col">
                  {reminders.slice(0, 4).map((r) => (
                    <li key={r.installmentId}>
                      <Link to={`/app/loans/${r.loanId}`} onClick={close} className="flex flex-col py-2 hover:text-accent-700">
                        <span className="tabular text-body font-medium">{usd(r.amount)} · {date(r.dueDate)}</span>
                        <span className={`text-small ${r.kind === "overdue" ? "text-danger" : "text-ink-2"}`}>{when(r)} · payment {r.number} · {shortId(r.loanId)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-body text-ink-2">{rem?.settings.enabled === false ? "Reminders are off." : "Nothing due soon."}</p>
              )}
              <Link to="/app/schedule" onClick={close} className="mt-3 text-small font-medium text-accent-700">Schedule and reminder settings</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const inner = (
    <span className="grid grid-cols-[0.75rem_1fr] gap-x-2 py-3">
      <span aria-hidden className={`mt-[9px] size-[7px] rounded-full ${note.readAt ? "bg-transparent" : "bg-accent-600"}`} />
      <span className="flex flex-col">
        <span className={`text-body ${note.readAt ? "" : "font-medium"}`}>{note.title}</span>
        <span className="text-small text-ink-2">{note.body}</span>
        <span className="mt-0.5 text-small text-ink-3">{ago(note.createdAt)}{!note.readAt && <span className="sr-only"> · unread</span>}</span>
      </span>
    </span>
  );
  return note.link ? (
    <Link to={note.link} onClick={onOpen} className="block rounded-control hover:text-accent-700">{inner}</Link>
  ) : (
    <button type="button" onClick={onOpen} className="block w-full rounded-control text-left">{inner}</button>
  );
}
