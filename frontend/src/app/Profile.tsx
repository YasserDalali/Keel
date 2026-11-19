import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { http, useLoad } from "../lib/api";
import { KYC_RESTARTABLE } from "../lib/loans";
import { completeness, isDemoBank, maskId, type ProfileView } from "../lib/profile";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Status } from "../ui/Status";
import { Arrow, LoadError, PageSkeleton } from "./AppShell";
import { BankCard, DemoSkip, DetailsForm, IdentityPanel, PlaidButton } from "./Setup";
import { ArtTile } from "./visuals";

export default function Profile() {
  const { data, error, loading, reload } = useLoad(() => http<ProfileView>("/profile"));
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  if (loading && !data) return <PageSkeleton />;
  if (!data) return <LoadError message={error} />;

  const c = completeness(data);
  const p = data.profile;
  const name = p?.firstName ? `${p.firstName} ${p.lastName ?? ""}`.trim() : null;
  const done = (msg: string) => () => reload().then(() => setNotice(msg));

  return (
    <Container className="grid gap-12 py-12 lg:grid-cols-12 lg:gap-10 lg:py-16" data-stagger>
      <header className="flex flex-col gap-6 lg:col-span-12 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className="text-label text-ink-2">Profile</p>
          <h1 className="text-h1 max-w-[18ch]">{name ?? "Your profile"}</h1>
          <p role="status" className="text-body text-accent-700 empty:hidden">{notice}</p>
        </div>
        <Completeness c={c} />
      </header>

      <div className="flex flex-col lg:col-span-8">
        <Section
          id="details"
          title="Details"
          state={p ? <Status tone="accent">Added</Status> : <Status tone="warning">Missing</Status>}
          action={p && !editing ? <Button variant="secondary" onClick={() => { setEditing(true); setNotice(""); }}>Edit</Button> : undefined}
        >
          {!p || editing ? (
            <DetailsForm
              saved={p}
              submitLabel={p ? "Save changes" : "Save details"}
              onSaved={() => reload().then(() => { setEditing(false); setNotice("Details saved."); })}
              footer={(submit) => (
                <div className="flex flex-wrap items-center gap-4">
                  {submit}
                  {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
                </div>
              )}
            />
          ) : (
            <Details p={p} />
          )}
        </Section>

        <Section
          id="bank"
          title="Bank"
          state={data.bankConnected ? <Status tone="accent">Connected</Status> : <Status tone="warning">Not connected</Status>}
        >
          {data.bankConnected ? (
            <div className="flex flex-col gap-5">
              <BankCard bank={data.bank} demoData={isDemoBank(data)} />
              <div className="flex flex-wrap items-center gap-4">
                <PlaidButton label="Reconnect bank" variant="secondary" onConnected={done("Bank reconnected.")} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <p className="max-w-[56ch] text-body text-ink-2">Needed before you can apply. Keel reads your balances once; it never moves money through this connection.</p>
              <div className="flex flex-wrap items-start gap-4">
                <PlaidButton label="Connect your bank" onConnected={done("Bank connected.")} />
                <DemoSkip label="Fill with demo bank" run={() => http("/demo/complete/bank", { method: "POST" })} onDone={done("Demo bank added.")} />
              </div>
            </div>
          )}
        </Section>

        <Section
          id="identity"
          title="Identity"
          state={data.kycStatus === "approved" ? <Status tone="accent">Verified</Status> : <Status tone="warning">Not verified</Status>}
        >
          <div className="flex flex-col gap-5">
            <IdentityPanel data={data} reload={reload} verb={data.kycStatus && data.kycStatus !== "pending" ? "Verify again" : "Verify my ID"} />
            {KYC_RESTARTABLE.includes(data.kycStatus) && (
              <DemoSkip label="Mark ID as verified" run={() => http("/demo/complete/identity", { method: "POST" })} onDone={done("ID marked as verified (demo).")} />
            )}
          </div>
        </Section>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-28 flex flex-col gap-6">
          <ArtTile flat src="/img/app-profile.webp" className="aspect-[3/4] w-full" position="50% 40%" />
          <p className="text-small text-ink-2">Your details are stored encrypted. Keel only reads your bank balances and never moves money through that connection.</p>
        </div>
      </aside>
    </Container>
  );
}

/** Three-part meter; each missing part links straight to its wizard step. */
function Completeness({ c }: { c: ReturnType<typeof completeness> }) {
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-small text-ink-2">Profile complete</span>
        <span className="tabular text-body font-medium">{c.done} of {c.total}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="img" aria-label={`${c.done} of ${c.total} parts complete`}>
        {c.parts.map((s) => <span key={s.key} className={`h-1.5 rounded-full ${s.done ? "bg-accent-600" : "bg-line-strong"}`} />)}
      </div>
      {c.next && (
        <Link to={`/app/setup?step=${c.next}`} className="group inline-flex items-center gap-2 self-start text-small font-medium text-accent-700">
          {c.parts.find((s) => s.key === c.next)?.label}
          <span className="transition-transform duration-250 group-hover:translate-x-1"><Arrow /></span>
        </Link>
      )}
    </div>
  );
}

function Section({ id, title, state, action, children }: { id: string; title: string; state: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-6 border-t border-line py-10 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 id={`${id}-title`} className="text-h2">{title}</h2>
          {state}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Details({ p }: { p: NonNullable<ProfileView["profile"]> }) {
  const [show, setShow] = useState(false);
  const rows: [string, ReactNode][] = [
    ["Name", `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "—"],
    ["Phone", p.phone ?? "—"],
    ["Address", p.address ?? "—"],
    [
      "National ID",
      <span className="inline-flex flex-wrap items-center gap-3">
        <span className="tabular">{show ? p.nationalIdNumber : maskId(p.nationalIdNumber)}</span>
        {p.nationalIdNumber && (
          <button type="button" aria-pressed={show} onClick={() => setShow((s) => !s)} className="-my-3 inline-flex min-h-11 items-center rounded-control px-2 text-small font-medium text-accent-700 hover:text-accent-800">
            {show ? "Hide" : "Show"}<span className="sr-only"> national ID</span>
          </button>
        )}
      </span>,
    ],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1">
          <dt className="text-small text-ink-2">{k}</dt>
          <dd className="text-body">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
