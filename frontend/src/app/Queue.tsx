import { useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { http, useLoad } from "../lib/api";
import { usd } from "../lib/format";
import { date, KYC, loanStatus, shortId, type KycStatus, type Loan, type ProfileRecord, type Risk } from "../lib/loans";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Dialog } from "../ui/Dialog";
import { Skeleton } from "../ui/Skeleton";
import { Status } from "../ui/Status";
import { TextLink } from "../ui/TextLink";
import { LoadError, PageHead, PageSkeleton } from "./AppShell";
import { ArtTile, StatStrip } from "./visuals";

const TABS = {
  waiting: { label: "Waiting", statuses: ["pending", "under_review"], title: "Loans waiting for a decision", empty: "Nothing waiting. New applications appear here." },
  repaying: { label: "Repaying", statuses: ["active", "approved"], title: "Loans being repaid", empty: "No loans are being repaid right now." },
  closed: { label: "Closed", statuses: ["fully_paid", "defaulted"], title: "Closed loans", empty: "No closed loans yet." },
  all: { label: "All", statuses: null, title: "All loans", empty: "No loans yet." },
} as const;
type TabKey = keyof typeof TABS;
const KEYS = Object.keys(TABS) as TabKey[];

const inTab = (t: TabKey) => (l: Loan) => !TABS[t].statuses || (TABS[t].statuses as readonly string[]).includes(l.status);
// D1 returns "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
const time = (l: Loan) => new Date(l.created_at.includes("T") ? l.created_at : `${l.created_at.replace(" ", "T")}Z`).getTime();
const thresholdOf = (l: Loan): number | null => {
  try {
    const t = l.risk_assessment_summary ? (JSON.parse(l.risk_assessment_summary) as Risk).threshold : null;
    return typeof t === "number" ? t : null;
  } catch {
    return null;
  }
};

export default function Queue() {
  const { data, error, loading, reload } = useLoad(() => http<{ loans: Loan[] }>("/loans"));
  const [params, setParams] = useSearchParams();
  const tab: TabKey = KEYS.includes(params.get("tab") as TabKey) ? (params.get("tab") as TabKey) : "waiting";
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  // Waiting is oldest-first so nobody's application sits behind newer ones.
  const rows = data.loans.filter(inTab(tab)).sort((a, b) => (tab === "waiting" ? time(a) - time(b) : time(b) - time(a)));
  const waiting = data.loans.filter(inTab("waiting")).length;

  const select = (t: TabKey) => {
    setParams(t === "waiting" ? {} : { tab: t }, { replace: true });
    setOpen(null);
  };
  const onKey = (e: KeyboardEvent) => {
    const i = KEYS.indexOf(tab);
    const next = e.key === "ArrowRight" ? KEYS[(i + 1) % KEYS.length] : e.key === "ArrowLeft" ? KEYS[(i + KEYS.length - 1) % KEYS.length] : e.key === "Home" ? KEYS[0] : e.key === "End" ? KEYS[KEYS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <Container className="flex flex-col gap-12 py-12 lg:gap-16 lg:py-16" data-stagger>
      <PageHead
        eyebrow="Review queue"
        title={TABS[tab].title}
        intro={
          tab === "waiting"
            ? waiting
              ? `${waiting} ${waiting === 1 ? "application" : "applications"} waiting. Oldest first.`
              : "Nothing needs a decision right now."
            : `${rows.length} ${rows.length === 1 ? "loan" : "loans"}. Newest first.`
        }
      />

      <Summary loans={data.loans.filter(inTab("waiting"))} />

      <section className="flex flex-col gap-6">
        <div role="tablist" aria-label="Loan status" className="flex gap-6 overflow-x-auto overflow-y-hidden sm:gap-8 border-b border-line [scrollbar-width:none]" onKeyDown={onKey}>
          {KEYS.map((k) => {
            const selected = k === tab;
            return (
              <button
                key={k}
                ref={(el) => {
                  tabRefs.current[k] = el;
                  if (selected) el?.scrollIntoView({ block: "nearest", inline: "nearest" }); // keep the selected tab visible on narrow screens
                }}
                role="tab"
                id={`tab-${k}`}
                aria-selected={selected}
                aria-controls="queue-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => select(k)}
                className={`relative flex h-11 shrink-0 items-center gap-2 text-body transition-colors duration-150 after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:origin-left after:bg-ink after:transition-transform after:duration-400 after:ease-out-expo ${
                  selected ? "text-ink after:scale-x-100" : "text-ink-2 after:scale-x-0 hover:text-ink"
                }`}
              >
                {TABS[k].label}
                <span className="tabular text-small text-ink-3">{data.loans.filter(inTab(k)).length}</span>
              </button>
            );
          })}
        </div>

        <p aria-live="polite" className="text-small text-accent-700 empty:hidden">{notice}</p>

        <div id="queue-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {rows.length === 0 ? (
            <div className="flex flex-col gap-6 py-6 sm:flex-row sm:items-center sm:gap-10">
              {tab === "waiting" && <ArtTile src="/img/tile-produce.webp" className="aspect-[4/3] w-full max-w-sm" />}
              <p className="text-body text-ink-2">{TABS[tab].empty}</p>
            </div>
          ) : (
            <ul>
              {rows.map((l) => (
                <Row
                  key={l.id}
                  loan={l}
                  open={open === l.id}
                  onToggle={() => setOpen(open === l.id ? null : l.id)}
                  onDecided={(msg) => {
                    setNotice(msg);
                    setOpen(null);
                    reload();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </Container>
  );
}

function Row({ loan, open, onToggle, onDecided }: { loan: Loan; open: boolean; onToggle: () => void; onDecided: (msg: string) => void }) {
  const s = loanStatus(loan);
  const panel = `loan-${loan.id}`;
  return (
    <li className="border-t border-line last:border-b">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={onToggle}
        className="group grid min-h-11 w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 text-left transition-colors duration-150 hover:bg-surface sm:grid-cols-[1fr_7rem_6rem_12rem_6rem_1.5rem] sm:px-2"
      >
        <span className="flex flex-col">
          <span className="tabular text-body font-medium">{shortId(loan.id)}</span>
          <span className="text-small text-ink-2">Applied {date(loan.created_at)}</span>
        </span>
        <span className="tabular text-right text-body">{usd(loan.amount)}</span>
        <span className="tabular hidden text-right text-body text-ink-2 sm:block">{loan.term_months} months</span>
        <span className="col-span-2 flex items-center justify-between sm:col-span-1 sm:justify-start">
          <Status tone={s.tone}>{s.label}</Status>
          <span className="tabular text-small text-ink-2 sm:hidden">Risk {score(loan)}</span>
        </span>
        <span className="hidden sm:block"><RiskMini loan={loan} /></span>
        <svg viewBox="0 0 16 16" aria-hidden className={`hidden size-4 justify-self-end text-ink-3 transition-transform duration-400 ease-out-expo group-hover:text-ink sm:block ${open ? "rotate-180" : ""}`}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={panel} hidden={!open}>
        {open && <Detail loan={loan} onDecided={onDecided} />}
      </div>
    </li>
  );
}

const score = (l: Loan) => (l.risk_assessment_score == null ? "—" : Math.round(l.risk_assessment_score));

/** Score as a 48px bar plus the number; red when under the loan's threshold. */
function RiskMini({ loan }: { loan: Loan }) {
  const v = loan.risk_assessment_score;
  if (v == null) return <span className="tabular block text-right text-body text-ink-3" title="No risk score">—</span>;
  const t = thresholdOf(loan);
  const below = t != null && v < t;
  return (
    <span className="flex items-center justify-end gap-2" title={`Risk score ${Math.round(v)} of 100${t != null ? `, threshold ${t}` : ""}`}>
      <span aria-hidden className="h-[3px] w-12 overflow-hidden rounded-full bg-line">
        <span className={`block h-full ${below ? "bg-danger" : "bg-accent-600"}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </span>
      <span className={`tabular text-body ${below ? "text-danger" : ""}`}>{Math.round(v)}</span>
    </span>
  );
}

/** Figures for what's waiting: how many, how much, how risky, how long. */
function Summary({ loans }: { loans: Loan[] }) {
  const scored = loans.filter((l) => l.risk_assessment_score != null);
  const avg = scored.length ? scored.reduce((s, l) => s + l.risk_assessment_score!, 0) / scored.length : 0;
  const threshold = loans.map(thresholdOf).find((t) => t != null);
  const oldest = loans.length ? Math.min(...loans.map(time)) : Date.now();
  const days = Math.max(0, (Date.now() - oldest) / 86_400_000);
  const whole = (n: number) => String(Math.round(n));
  return (
    <StatStrip
      items={[
        { label: "Waiting", value: loans.length, format: whole },
        { label: "Amount requested", value: loans.reduce((s, l) => s + l.amount, 0) },
        { label: "Average risk", value: avg, format: (n) => (scored.length ? whole(n) : "—"), note: threshold != null ? `Threshold ${threshold}` : undefined },
        { label: "Oldest waiting", value: loans.length ? days : 0, format: (n) => (loans.length ? `${Math.round(n)} days` : "—") },
      ]}
    />
  );
}

// ponytail: module-level cache, lives for the tab session; profiles change rarely and officers can refresh.
const profiles = new Map<string, Promise<ProfileRecord | null>>();
function getProfile(id: string) {
  if (!profiles.has(id)) {
    profiles.set(
      id,
      http<{ profile: ProfileRecord }>(`/profile/${id}`).then(
        (r) => r.profile,
        (e) => {
          profiles.delete(id); // let a retry happen on the next open
          if (e.status === 404) return null;
          throw e;
        },
      ),
    );
  }
  return profiles.get(id)!;
}

function Detail({ loan, onDecided }: { loan: Loan; onDecided: (msg: string) => void }) {
  const profile = useLoad(() => getProfile(loan.borrower_id), [loan.borrower_id]);
  const risk: Risk | null = loan.risk_assessment_summary ? JSON.parse(loan.risk_assessment_summary) : null;
  const depositOwed = loan.upfront_required === 1 && loan.upfront_paid !== 1;
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setErr("");
    try {
      await http(`/loans/${loan.id}/${kind}`, { method: "POST" });
      setConfirming(false);
      onDecided(kind === "approve" ? `Approved ${shortId(loan.id)}. The borrower's schedule is ready.` : `Declined ${shortId(loan.id)}.`);
    } catch (e) {
      setConfirming(false);
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 grid animate-[rise_400ms_var(--ease-out-expo)] gap-10 rounded-art bg-surface p-6 lg:grid-cols-2 lg:gap-16 lg:p-8">
      <section aria-label="Borrower" className="flex flex-col gap-4">
        <h3 className="text-label text-ink-2">Borrower</h3>
        {profile.loading && !profile.data ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full max-w-[320px]" />)}
          </div>
        ) : profile.error ? (
          <p role="alert" className="text-body text-danger">{profile.error}</p>
        ) : !profile.data ? (
          <p className="text-body text-ink-2">No profile on file.</p>
        ) : (
          <Facts
            rows={[
              ["Name", [profile.data.firstName, profile.data.lastName].filter(Boolean).join(" ") || "—"],
              ["Phone", profile.data.phone ?? "—"],
              ["Address", profile.data.address ?? "—"],
              ["National ID", profile.data.nationalIdNumber ?? "—"],
              ["Identity", kycStatus(profile.data.kycStatus)],
            ]}
          />
        )}
        {loan.upfront_required === 1 && (
          <p className="text-body">
            Deposit {usd(loan.upfront_amount ?? 0)}: <span className={depositOwed ? "text-warning" : "text-accent-700"}>{depositOwed ? "not paid yet" : "paid"}</span>
          </p>
        )}
      </section>

      <section aria-label="Risk" className="flex flex-col gap-4">
        <h3 className="text-label text-ink-2">Risk</h3>
        {risk ? <RiskBar risk={risk} /> : <p className="text-body text-ink-2">No risk data for this loan.</p>}
      </section>

      <div className="flex flex-col gap-4 border-t border-line pt-6 lg:col-span-2">
        {loan.status === "pending" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => decide("approve")} loading={busy === "approve"} disabled={depositOwed || busy !== null}>Approve</Button>
            <Button variant="secondary" onClick={() => setConfirming(true)} disabled={busy !== null} className="text-danger border-danger/40 hover:border-danger">Decline</Button>
            {depositOwed && <p className="text-small text-ink-2">Waiting for the borrower's {usd(loan.upfront_amount ?? 0)} deposit.</p>}
          </div>
        )}
        {err && <p role="alert" className="text-small text-danger">{err}</p>}
        <TextLink to={`/app/loans/${loan.id}`} className="self-start text-body font-medium">Open full loan</TextLink>
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Decline this application?">
        <p className="text-body text-ink-2">
          {shortId(loan.id)} for {usd(loan.amount)} will be closed and the borrower will see it as not approved. This can't be undone.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => decide("reject")} loading={busy === "reject"} className="text-danger border-danger/40 hover:border-danger">Decline application</Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
        </div>
      </Dialog>
    </div>
  );
}

function kycStatus(raw: string) {
  const k = KYC[raw as KycStatus];
  return k ? <Status tone={k.tone}>{k.label}</Status> : raw;
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-body">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Scores are 0–100 (api/src/plaid/scoring.ts); the tick marks the approval threshold. */
function RiskBar({ risk }: { risk: Risk }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
  const below = risk.finalScore < risk.threshold;
  const weights = Object.entries(risk.weights)
    .map(([k, v]) => `${k === "bank" ? "Bank" : k === "behavior" ? "Behaviour" : k} ${Math.round(v * 100)}%`)
    .join(" · ");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="flex items-baseline gap-2">
          <span className={`tabular text-h1 ${below ? "text-danger" : "text-accent-700"}`}>{Math.round(risk.finalScore)}</span>
          <span className="text-body text-ink-2">of 100</span>
        </p>
        <div className="relative pt-6">
          <span className="tabular absolute top-0 -translate-x-1/2 text-small whitespace-nowrap text-ink-2" style={{ left: pct(risk.threshold) }}>
            Threshold {risk.threshold}
          </span>
          <div
            className="relative h-2 overflow-hidden rounded-full bg-line"
            role="meter"
            aria-label="Risk score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(risk.finalScore)}
            aria-valuetext={`${Math.round(risk.finalScore)} of 100, threshold ${risk.threshold}`}
          >
            <div
              className={`h-full origin-left animate-[grow_900ms_var(--ease-out-expo)_both] ${below ? "bg-danger" : "bg-accent-600"}`}
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, risk.finalScore / 100))})` }}
            />
          </div>
          <span aria-hidden className="absolute bottom-[-4px] h-4 w-[2px] -translate-x-1/2 bg-ink" style={{ left: pct(risk.threshold) }} />
        </div>
      </div>
      <Facts
        rows={[
          ["Bank safety", <span className="tabular">{Math.round(risk.bankSafety)}</span>],
          ["Behaviour", <span className="tabular">{Math.round(risk.behavior)}</span>],
          ["Weights", weights],
        ]}
      />
    </div>
  );
}
