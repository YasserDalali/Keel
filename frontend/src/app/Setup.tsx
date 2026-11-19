import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { usePlaidLink } from "react-plaid-link";
import { DiditSdk } from "@didit-protocol/sdk-web";
import { ApiError, http, useLoad } from "../lib/api";
import { date, KYC, KYC_RESTARTABLE, type ProfileRecord } from "../lib/loans";
import { completeness, isDemoBank, maskId, stepFrom, WIZARD, type BankInfo, type ProfileView, type WizardStep } from "../lib/profile";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Container } from "../ui/Container";
import { DemoButton, DemoFill, demoProfile, useDemo } from "../ui/DemoFill";
import { Form } from "../ui/Form";
import { Status } from "../ui/Status";
import { TextField } from "../ui/TextField";
import { LoadError, PageSkeleton } from "./AppShell";
import { ArtTile } from "./visuals";

const COPY: Record<WizardStep, { title: string; intro: string; art: string; why: string[] }> = {
  profile: {
    title: "Tell us about you",
    intro: "These go on your loan agreement. They're stored encrypted.",
    art: "/img/app-details.webp",
    why: ["Your name and ID go on the loan agreement.", "We call or text only about your loan.", "Your address is where the business runs, or where you live."],
  },
  bank: {
    title: "Connect your bank",
    intro: "Keel reads your balances once to size your loan. We never move money through this connection.",
    art: "/img/app-bank.webp",
    why: ["Balances show what you can comfortably repay.", "The connection is read-only.", "You can reconnect it from your profile at any time."],
  },
  identity: {
    title: "Verify your ID",
    intro: "A photo of your ID and a short selfie, checked by Didit. It takes about three minutes.",
    art: "/img/app-id.webp",
    why: ["Lenders must confirm who they lend to.", "Didit checks your ID photo and selfie, then tells Keel the result.", "Do it once; it covers every future loan."],
  },
  review: {
    title: "Check everything",
    intro: "This is what Keel uses for your loans. You can change any of it later on your profile.",
    art: "/img/app-review.webp",
    why: ["Edit takes you back to that step.", "A loan officer sees these details when reviewing your application.", "A loan officer reviews every application."],
  },
};

const WAITING = ["in_progress", "in_review", "resubmitted"];

export default function Setup() {
  const { data, error, loading, reload } = useLoad(() => http<ProfileView>("/profile"));
  const [params, setParams] = useSearchParams();
  const [skipped, setSkipped] = useState<Set<WizardStep>>(new Set());
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const step = data ? stepFrom(params.get("step"), data) : undefined;

  // focus the step heading on every step change after the first render (keyboard + screen reader users)
  useEffect(() => {
    if (!step) return;
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  if (loading && !data) return <PageSkeleton />;
  if (!data || !step) return <LoadError message={error} />;

  const i = WIZARD.findIndex((w) => w.key === step);
  const go = (k: WizardStep) => setParams({ step: k });
  const next = () => go(WIZARD[Math.min(i + 1, WIZARD.length - 1)].key);
  const back = i > 0 ? () => go(WIZARD[i - 1].key) : undefined;
  const skip = (k: WizardStep) => () => reload().then(() => {
    setSkipped((s) => new Set(s).add(k));
    next();
  });
  const copy = COPY[step];

  return (
    <Container className="grid min-h-[calc(100dvh-4rem)] gap-12 py-10 lg:grid-cols-12 lg:gap-10 lg:py-14">
      <div className="flex flex-col gap-10 lg:col-span-7">
        <Progress step={step} data={data} onGo={go} />

        <section key={step} aria-labelledby="step-title" className="flex flex-1 flex-col gap-8" data-stagger>
          <header className="flex flex-col gap-3">
            <p className="tabular text-label text-ink-2">Step {i + 1} of {WIZARD.length} · {WIZARD[i].label}</p>
            <h1 id="step-title" ref={heading} tabIndex={-1} className="text-h1 max-w-[16ch] focus:outline-none">{copy.title}</h1>
            <p className="max-w-[52ch] text-body-lg text-ink-2">{copy.intro}</p>
            {skipped.has(step) && <p className="text-small text-ink-2">Skipped — filled with demo data.</p>}
          </header>

          {step === "profile" && (
            <DetailsForm
              saved={data.profile}
              submitLabel="Save and continue"
              onSaved={() => reload().then(next)}
              footer={(submit) => (
                <Footer right={<>{submit}<DemoSkip label="Skip — fill with demo data" run={() => http("/profile", { method: "PUT", json: demoProfile() })} onDone={skip("profile")} /></>} />
              )}
            />
          )}

          {step === "bank" && <BankStep data={data} onConnected={() => reload().then(next)} onSkip={skip("bank")} onNext={next} back={back} />}
          {step === "identity" && <IdentityStep data={data} reload={reload} onNext={next} onSkip={skip("identity")} back={back} />}
          {step === "review" && <Review data={data} skipped={skipped} onEdit={go} back={back} />}
        </section>
      </div>

      <aside className="hidden lg:col-span-4 lg:col-start-9 lg:block">
        <div className="sticky top-28 flex flex-col gap-6">
          <ArtTile flat key={step} src={copy.art} className="aspect-[4/5] w-full animate-[rise_500ms_var(--ease-out-expo)]" />
          <div className="flex flex-col gap-3">
            <h2 className="text-label text-ink-2">Why we ask</h2>
            <ul className="flex flex-col gap-2">
              {copy.why.map((w) => (
                <li key={w} className="grid grid-cols-[1rem_1fr] gap-2 text-small text-ink-2">
                  <span aria-hidden className="mt-[7px] size-1.5 rounded-full bg-accent-600" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </Container>
  );
}

/** Four segments + named, clickable steps. Done parts fill accent; the current one is ink. */
function Progress({ step, data, onGo }: { step: WizardStep; data: ProfileView; onGo: (k: WizardStep) => void }) {
  const parts = completeness(data).parts;
  const done = (k: WizardStep) => (k === "review" ? false : !!parts.find((p) => p.key === k)?.done);
  return (
    <nav aria-label="Setup steps">
      <ol className="grid grid-cols-4 gap-2">
        {WIZARD.map((w) => {
          const current = w.key === step;
          return (
            <li key={w.key}>
              <button
                type="button"
                onClick={() => onGo(w.key)}
                aria-current={current ? "step" : undefined}
                className="group flex min-h-11 w-full flex-col justify-center gap-2 py-2 text-left"
              >
                <span aria-hidden className={`h-1 w-full rounded-full transition-colors duration-400 ${current ? "bg-ink" : done(w.key) ? "bg-accent-600" : "bg-line-strong group-hover:bg-ink-3"}`} />
                <span className={`hidden text-small sm:block ${current ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"}`}>
                  {w.label}
                  {done(w.key) && <span className="sr-only"> (done)</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Bottom bar: Back on the left, the step's actions on the right. */
function Footer({ back, right }: { back?: () => void; right: ReactNode }) {
  return (
    <div className="mt-auto flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div>{back && <Button variant="ghost" onClick={back}>Back</Button>}</div>
      <div className="flex flex-wrap items-center gap-4 sm:justify-end">{right}</div>
    </div>
  );
}

const FIELDS = ["firstName", "lastName", "phone", "address", "nationalIdNumber"] as const;

/** Details form, grouped into name / contact / ID. Shared by the wizard and the profile page. */
export function DetailsForm({ saved, submitLabel, onSaved, footer }: {
  saved: ProfileRecord | null;
  submitLabel: string;
  onSaved: () => unknown;
  footer?: (submit: ReactNode) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    try {
      await http("/profile", { method: "PUT", json: Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? "").trim()])) });
      await onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const button = <Button type="submit" size="lg" loading={busy}>{submitLabel}</Button>;
  return (
    <Form onSubmit={submit} className="flex flex-1 flex-col gap-10">
      <DemoFill values={demoProfile} />
      <Group legend="Name">
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label="First name" name="firstName" required autoComplete="given-name" defaultValue={saved?.firstName ?? ""} />
          <TextField label="Last name" name="lastName" required autoComplete="family-name" defaultValue={saved?.lastName ?? ""} />
        </div>
      </Group>
      <Group legend="Contact">
        <TextField label="Phone" name="phone" type="tel" required autoComplete="tel" pattern="[0-9 \+\(\)\-]{7,20}" title="Use digits, spaces and an optional +, like +234 801 555 0123." hint="Include your country code" defaultValue={saved?.phone ?? ""} />
        <TextField label="Business or home address" name="address" required autoComplete="street-address" defaultValue={saved?.address ?? ""} />
      </Group>
      <Group legend="ID">
        <TextField label="National ID number" name="nationalIdNumber" required minLength={4} autoComplete="off" hint="As printed on your ID card" defaultValue={saved?.nationalIdNumber ?? ""} />
      </Group>
      {err && <p role="alert" className="text-small text-danger">{err}</p>}
      {footer ? footer(button) : <div>{button}</div>}
    </Form>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-6">
      <legend className="mb-4 text-label text-ink-2">{legend}</legend>
      {children}
    </fieldset>
  );
}

function BankStep({ data, onConnected, onSkip, onNext, back }: { data: ProfileView; onConnected: () => void; onSkip: () => void; onNext: () => void; back?: () => void }) {
  const demo = useDemo();
  return (
    <div className="flex flex-1 flex-col gap-8">
      {data.bankConnected ? (
        <BankCard bank={data.bank} demoData={isDemoBank(data)} />
      ) : (
        <PlaidButton label="Connect your bank" onConnected={onConnected} />
      )}
      <Footer
        back={back}
        right={
          data.bankConnected ? <Button size="lg" onClick={onNext}>Continue</Button>
          : demo ? <DemoSkip label="Skip — fill with demo data" run={() => http("/demo/complete/bank", { method: "POST" })} onDone={onSkip} />
          : <Button variant="ghost" onClick={onNext}>Skip for now</Button>
        }
      />
    </div>
  );
}

/** Connected bank: institution, read-only safety score, connected date. */
export function BankCard({ bank, demoData }: { bank?: BankInfo | null; demoData?: boolean }) {
  const score = bank?.safetyScore;
  return (
    <div className="flex flex-col gap-5 rounded-art bg-surface p-6 shadow-float-1">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-h3">{bank?.institutionName ?? "Bank connected"}</span>
        <Status tone="accent">Connected</Status>
      </div>
      {score != null && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-small text-ink-2">
            <span>Bank safety score</span>
            <span className="tabular text-ink">{Math.round(score)} of 100</span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-line" role="img" aria-label={`Bank safety score ${Math.round(score)} of 100`}>
            <div className="h-full origin-left bg-accent-600 animate-[grow_900ms_var(--ease-out-expo)_both]" style={{ transform: `scaleX(${Math.min(1, score / 100)})` }} />
          </div>
        </div>
      )}
      <p className="text-small text-ink-2">
        {bank?.connectedAt ? `Connected ${date(bank.connectedAt)}` : "Connected"}
        {demoData && " · Demo data"}
      </p>
    </div>
  );
}

// ponytail: mounts only where a bank can be connected, so the Plaid script loads only then.
export function PlaidButton({ label, onConnected, variant = "primary" }: { label: string; onConnected: () => void; variant?: "primary" | "secondary" }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    http<{ linkToken: string }>("/plaid/link-token", { method: "POST" }).then(
      (d) => setToken(d.linkToken),
      () => setErr("We couldn't start the bank connection. Try again in a minute."),
    );
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      if (!publicToken) return;
      setBusy(true);
      setErr("");
      try {
        await http("/plaid/connect", { method: "POST", json: { publicToken } });
        onConnected();
      } catch {
        setErr("Your bank connected, but we couldn't read your balances. Try connecting again.");
      } finally {
        setBusy(false);
      }
    },
  });

  return (
    <div className="flex flex-col items-start gap-3">
      <Button size={variant === "primary" ? "lg" : "md"} variant={variant} onClick={() => open()} disabled={!ready || !token} loading={busy || (!token && !err)}>{label}</Button>
      {err && <p role="alert" className="text-small text-danger">{err}</p>}
    </div>
  );
}

function IdentityStep({ data, reload, onNext, onSkip, back }: { data: ProfileView; reload: () => Promise<void>; onNext: () => void; onSkip: () => void; back?: () => void }) {
  const demo = useDemo();
  const status = data.kycStatus ?? "pending";
  const canContinue = status === "approved" || WAITING.includes(status);
  return (
    <div className="flex flex-1 flex-col gap-8">
      <IdentityPanel data={data} reload={reload} />
      <Footer
        back={back}
        right={
          canContinue ? <Button size="lg" onClick={onNext}>Continue</Button>
          : demo ? <DemoSkip label="Skip — fill with demo data" run={() => http("/demo/complete/identity", { method: "POST" })} onDone={onSkip} />
          : null
        }
      />
    </div>
  );
}

/** ID status and the action that fits it: verify, check again, or nothing when verified. */
export function IdentityPanel({ data, reload, verb = "Verify my ID" }: { data: ProfileView; reload: () => Promise<void>; verb?: string }) {
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const status = checking ? "in_progress" : (data.kycStatus ?? "pending");
  const kyc = KYC[status];

  useEffect(() => () => { DiditSdk.shared.onComplete = undefined; }, []);

  // Ask the server to fetch the latest Didit decision (works even when Didit's webhook can't reach us), then re-read.
  async function checkNow() {
    setChecking(true);
    setErr("");
    try {
      await http("/kyc/refresh", { method: "POST" });
    } catch (e) {
      setErr((e as Error).message);
    }
    await reload().finally(() => setChecking(false));
  }

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const { url } = await http<{ url: string }>("/kyc/session", { method: "POST" });
      DiditSdk.shared.onComplete = (result) => {
        if (result.type !== "completed") return;
        setChecking(true);
        setTimeout(checkNow, 2000); // give Didit a moment to finish its decision

      };
      await DiditSdk.shared.startVerification({ url });
    } catch (e) {
      console.error("[kyc] start failed", e);
      setErr("We couldn't open the ID check. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2" aria-live="polite">
        <Status tone={kyc.tone}>{kyc.label}</Status>
        <p className="max-w-[56ch] text-body text-ink-2">
          {kyc.note}
          {status === "approved" && data.kycUpdatedAt && ` Verified ${date(data.kycUpdatedAt)}.`}
        </p>
      </div>
      {KYC_RESTARTABLE.includes(status) ? (
        <div className="flex flex-col gap-5">
          <Checkbox checked={consented} onChange={(e) => setConsented(e.target.checked)}>
            I agree to verify my identity with Didit, which captures a photo of my ID and a short selfie video.
          </Checkbox>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={start} loading={busy} disabled={!consented}>{verb}</Button>
            {!consented && <span className="text-small text-ink-2">Tick the box above to continue.</span>}
          </div>
          {err && <p role="alert" className="text-small text-danger">{err}</p>}
        </div>
      ) : WAITING.includes(status) ? (
        <div>
          <Button variant="secondary" loading={checking} onClick={checkNow}>Check again</Button>
        </div>
      ) : null}
    </div>
  );
}

function Review({ data, skipped, onEdit, back }: { data: ProfileView; skipped: Set<WizardStep>; onEdit: (k: WizardStep) => void; back?: () => void }) {
  const c = completeness(data);
  const ready = c.next === null;
  const p = data.profile;
  const kyc = KYC[data.kycStatus ?? "pending"];
  const demoNote = (k: WizardStep) => (skipped.has(k) ? " · Demo data" : "");
  const rows: { key: WizardStep; label: string; done: boolean; value: ReactNode }[] = [
    {
      key: "profile", label: "Your details", done: !!p,
      value: p ? (
        <>
          <span className="text-body">{p.firstName} {p.lastName}</span>
          <span className="text-small text-ink-2">{p.phone} · {p.address}</span>
          <span className="tabular text-small text-ink-2">ID {maskId(p.nationalIdNumber)}{demoNote("profile")}</span>
        </>
      ) : <span className="text-body text-ink-2">Not added yet.</span>,
    },
    {
      key: "bank", label: "Bank", done: data.bankConnected,
      value: data.bankConnected ? (
        <>
          <span className="text-body">{data.bank?.institutionName ?? "Connected"}</span>
          <span className="tabular text-small text-ink-2">
            {data.bank ? `Safety score ${Math.round(data.bank.safetyScore)} of 100` : "Read-only connection"}
            {isDemoBank(data) || skipped.has("bank") ? " · Demo data" : ""}
          </span>
        </>
      ) : <span className="text-body text-ink-2">Not connected. You'll need it before you can apply.</span>,
    },
    {
      key: "identity", label: "ID", done: data.kycStatus === "approved",
      value: (
        <>
          <Status tone={kyc.tone}>{kyc.label}</Status>
          {demoNote("identity") && <span className="text-small text-ink-2">Demo data</span>}
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8">
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div key={r.key} className="grid gap-3 border-t border-line py-5 last:border-b sm:grid-cols-[10rem_1fr_auto] sm:items-start sm:gap-6">
            <dt className="flex items-center gap-2 text-body font-medium">
              <span aria-hidden className={`size-2 rounded-full ${r.done ? "bg-accent-600" : "bg-warning"}`} />
              {r.label}
              <span className="sr-only">{r.done ? "(done)" : "(missing)"}</span>
            </dt>
            <dd className="flex flex-col gap-1">{r.value}</dd>
            <dd>
              <button type="button" onClick={() => onEdit(r.key)} className="-my-2 -mr-2 inline-flex min-h-11 items-center rounded-control px-2 text-body font-medium text-accent-700 hover:text-accent-800">
                {r.done ? "Edit" : "Add"}<span className="sr-only"> {r.label.toLowerCase()}</span>
              </button>
            </dd>
          </div>
        ))}
      </dl>
      {!ready && (
        <p className="text-body text-ink-2">
          {c.total - c.done} {c.total - c.done === 1 ? "part is" : "parts are"} missing. You can finish now and add {c.total - c.done === 1 ? "it" : "them"} from your profile.
        </p>
      )}
      <Footer
        back={back}
        right={
          ready ? (
            <>
              <Button variant="secondary" to="/app/profile">Go to your profile</Button>
              <Button size="lg" to="/app/apply">Apply for a loan</Button>
            </>
          ) : (
            <Button size="lg" to="/app/profile">Finish</Button>
          )
        }
      />
    </div>
  );
}

/** Demo-only skip: fills the step with demo data through the API, then moves on. Hidden unless demo mode is on. */
export function DemoSkip({ label, run, onDone }: { label: string; run: () => Promise<unknown>; onDone: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      await run();
      await onDone();
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404 ? "Demo mode is off on the API. Add DEMO_MODE=true to .dev.vars and restart wrangler dev." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <DemoButton label={label} onClick={go} busy={busy} />
      {err && <span role="alert" className="text-small text-danger">{err}</span>}
    </span>
  );
}

