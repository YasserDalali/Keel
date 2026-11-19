import { useEffect, useState } from "react";
import { http } from "../lib/api";
import type { Reminder, ReminderSettings as Settings } from "../lib/history";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";

type Data = { reminders: Reminder[]; settings: Settings };

// One request shared by the bell, the banner and the settings; refreshReminders() refetches for all of them.
let cache: Promise<Data> | null = null;
const listeners = new Set<() => void>();
const load = () => (cache ??= http<Data>("/reminders").catch((e) => { cache = null; throw e; }));
export function refreshReminders() {
  cache = null;
  listeners.forEach((l) => l());
}
if (typeof window !== "undefined") window.addEventListener("keel:session-reset", refreshReminders);

export function useReminders() {
  const [state, setState] = useState<{ data?: Data; error?: string }>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    let live = true;
    load().then((data) => live && setState({ data }), (e: Error) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [tick]);
  return state;
}

/** "Overdue by 3 days" / "Due today" / "Due in 2 days" */
export function when(r: Reminder) {
  if (r.kind === "overdue") return `Overdue by ${Math.abs(r.daysUntil)} ${Math.abs(r.daysUntil) === 1 ? "day" : "days"}`;
  if (r.kind === "due_today") return "Due today";
  return `Due in ${r.daysUntil} ${r.daysUntil === 1 ? "day" : "days"}`;
}

/** Turn reminders on/off and choose how early "due soon" starts. */
export function ReminderSettings() {
  const { data } = useReminders();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = draft ?? data?.settings ?? { enabled: true, daysBefore: 3 };
  const dirty = !!draft && !!data && (draft.enabled !== data.settings.enabled || draft.daysBefore !== data.settings.daysBefore);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await http("/reminders/settings", { method: "PUT", json: s });
      refreshReminders();
      setDraft(null);
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reminder-settings" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="reminder-settings" className="text-h3">Reminders</h2>
        <p className="text-small text-ink-2">Shown on your dashboard and the bell at the top of every page.</p>
      </div>
      <Checkbox checked={s.enabled} onChange={(e) => setDraft({ ...s, enabled: e.target.checked })}>Remind me about payments</Checkbox>
      <Select label="Start reminding me" value={s.daysBefore} disabled={!s.enabled} onChange={(e) => setDraft({ ...s, daysBefore: Number(e.target.value) })}>
        {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d === 1 ? "1 day before" : `${d} days before`}</option>)}
      </Select>
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={save} loading={busy} disabled={!dirty}>Save</Button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-small ${msg.ok ? "text-accent-700" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}

export function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
