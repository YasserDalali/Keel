import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { usePlaidLink } from "react-plaid-link";
import { DiditSdk } from "@didit-protocol/sdk-web";
import { ApiError, http, useLoad } from "../lib/api";
import { KYC, KYC_RESTARTABLE, readiness, type Profile } from "../lib/loans";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { DemoButton, DemoFill, demoProfile } from "../ui/DemoFill";
import { Form } from "../ui/Form";
import { Container } from "../ui/Container";
import { Status } from "../ui/Status";
import { TextField } from "../ui/TextField";
import { LoadError, PageSkeleton } from "./AppShell";
import { ArtTile } from "./visuals";

type StepKey = "profile" | "bank" | "identity";
const ORDER: StepKey[] = ["profile", "bank", "identity"];
const ART: Record<StepKey, string> = { profile: "/img/tile-sewing.webp", bank: "/img/tile-grocer.webp", identity: "/img/tile-pottery.webp" };

export default function Setup() {
  const { data, error, loading, reload } = useLoad(() => http<Profile>("/profile"));
  const [params, setParams] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const asked = params.get("step") as StepKey | null;
  const step: StepKey | undefined = data
    ? ORDER.includes(asked as StepKey) ? asked! : (readiness(data).find((s) => !s.done)?.key ?? "profile")
    : undefined;

  // move focus to the new step's heading on every step change after the first render
  useEffect(() => {
    if (!step) return;
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  if (loading && !data) return <PageSkeleton />;
  if (!data || !step) return <LoadError message={error} />;

  const steps = readiness(data);
  const index = ORDER.indexOf(step);
  const go = (k: StepKey) => setParams({ step: k });
  const next = () => (index < 2 ? go(ORDER[index + 1]) : undefined);
  const label = steps[index].label;

  return (
    <Container className="grid gap-12 py-12 lg:grid-cols-12 lg:gap-10 lg:py-16" data-stagger>
      <div className="flex flex-col gap-8 lg:col-span-4">
        <p className="tabular text-label text-ink-2">Set up · Step {index + 1} of 3</p>
        <ol className="flex flex-col">
          {steps.map((s, i) => {
            const current = s.key === step;
            return (
              <li key={s.key} className="border-t border-line last:border-b">
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={current ? "step" : undefined}
                  className={`grid min-h-14 w-full grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-4 text-left transition-colors duration-150 hover:bg-surface sm:px-2 ${current ? "text-ink" : "text-ink-2"}`}
                >
                  <span className="tabular text-small text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-body ${current ? "font-medium" : ""}`}>{s.label}</span>
                  {s.done && <Status tone="accent">Done</Status>}
                </button>
              </li>
            );
          })}
        </ol>
        <ArtTile key={step} src={ART[step]} className="hidden aspect-[4/5] w-full max-w-[320px] animate-[rise_500ms_var(--ease-out-expo)] lg:block" />
      </div>

      <section aria-labelledby="step-title" className="flex flex-col gap-8 lg:col-span-7 lg:col-start-6">
        <h1 id="step-title" ref={heading} tabIndex={-1} className="text-h2 focus:outline-none">{label}</h1>
        {step === "profile" && <ProfileStep data={data} onSaved={() => reload().then(next)} />}
        {step === "bank" && <BankStep connected={data.bankConnected} onConnected={() => reload().then(next)} onSkip={next} />}
        {step === "identity" && <IdentityStep data={data} reload={reload} />}
      </section>
    </Container>
  );
}

const FIELDS = ["firstName", "lastName", "phone", "address", "nationalIdNumber"] as const;

function ProfileStep({ data, onSaved }: { data: Profile; onSaved: () => void }) {
  const saved = data.profile;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const json = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? "").trim()]));
    setBusy(true);
    setErr("");
    try {
      await http("/profile", { method: "PUT", json });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={submit} className="flex flex-col gap-6">
      <DemoFill values={demoProfile} />
      <p className="max-w-[56ch] text-body-lg text-ink-2">
        {saved ? "These are saved. Change anything that's out of date." : "We use these to prepare your loan agreement. They're stored encrypted."}
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label="First name" name="firstName" required autoComplete="given-name" defaultValue={saved?.firstName ?? ""} />
        <TextField label="Last name" name="lastName" required autoComplete="family-name" defaultValue={saved?.lastName ?? ""} />
      </div>
      <TextField label="Phone" name="phone" type="tel" required autoComplete="tel" pattern="[0-9 \+\(\)\-]{7,20}" title="Use digits, spaces and an optional +, like +234 801 555 0123." hint="Include your country code" defaultValue={saved?.phone ?? ""} />
      <TextField label="Business or home address" name="address" required autoComplete="street-address" defaultValue={saved?.address ?? ""} />
      <TextField label="National ID number" name="nationalIdNumber" required minLength={4} autoComplete="off" hint="As printed on your ID card" defaultValue={saved?.nationalIdNumber ?? ""} />
      {err && <p role="alert" className="text-small text-danger">{err}</p>}
      <div className="flex flex-wrap items-center gap-6">
        <Button type="submit" size="lg" loading={busy}>{saved ? "Save changes" : "Save and continue"}</Button>
        {saved && <Status tone="accent">Saved</Status>}
      </div>
    </Form>
  );
}

function BankStep({ connected, onConnected, onSkip }: { connected: boolean; onConnected: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[56ch] text-body-lg text-ink-2">
        Keel reads your balances once to size your loan. We never move money through this connection.
      </p>
      {connected ? (
        <div className="flex flex-wrap items-center gap-6">
          <Status tone="accent">Connected</Status>
          <Button variant="secondary" onClick={onSkip}>Continue</Button>
        </div>
      ) : (
        <>
          <PlaidButton onConnected={onConnected} onSkip={onSkip} />
          <DemoComplete step="bank" label="Mark bank as connected" onDone={onConnected} />
        </>
      )}
    </div>
  );
}

// ponytail: mounts only on the bank step, so the Plaid script loads only when needed.
function PlaidButton({ onConnected, onSkip }: { onConnected: () => void; onSkip: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    http<{ linkToken: string }>("/plaid/link-token", { method: "POST" }).then(
      (d) => setToken(d.linkToken),
      () => setErr("We couldn't start the bank connection. Try again in a minute, or skip for now."),
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
    <div className="flex flex-col gap-4">
      {err && <p role="alert" className="text-small text-danger">{err}</p>}
      <div className="flex flex-wrap items-center gap-6">
        <Button size="lg" onClick={() => open()} disabled={!ready || !token} loading={busy || (!token && !err)}>Connect your bank</Button>
        <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
      </div>
    </div>
  );
}

function IdentityStep({ data, reload }: { data: Profile; reload: () => Promise<void> }) {
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const status = checking ? "in_progress" : (data.kycStatus ?? "pending");
  const kyc = KYC[status];

  useEffect(() => () => { DiditSdk.shared.onComplete = undefined; }, []);

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const { url } = await http<{ url: string }>("/kyc/session", { method: "POST" });
      DiditSdk.shared.onComplete = (result) => {
        if (result.type !== "completed") return;
        // the Didit webhook is the source of truth; give it a moment before re-reading
        setChecking(true);
        setTimeout(() => reload().finally(() => setChecking(false)), 3000);
      };
      await DiditSdk.shared.startVerification({ url });
    } catch {
      setErr("We couldn't open verification. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2" aria-live="polite">
        <Status tone={kyc.tone}>{kyc.label}</Status>
        <p className="max-w-[56ch] text-body-lg text-ink-2">{kyc.note}</p>
      </div>

      {status === "approved" ? (
        <div className="flex flex-wrap items-center gap-6">
          {data.bankConnected && data.profile ? (
            <Button size="lg" to="/app/apply">Apply for a loan</Button>
          ) : (
            <Button size="lg" to={`/app/setup?step=${data.profile ? "bank" : "profile"}`}>{data.profile ? "Connect your bank" : "Add your details"}</Button>
          )}
          <Button variant="ghost" to="/app/loans">Back to loans</Button>
        </div>
      ) : KYC_RESTARTABLE.includes(status) ? (
        <div className="flex flex-col gap-6">
          <Checkbox checked={consented} onChange={(e) => setConsented(e.target.checked)}>
            I agree to verify my identity with Didit, which captures a photo of my ID and a short selfie video.
          </Checkbox>
          {err && <p role="alert" className="text-small text-danger">{err}</p>}
          <div className="flex flex-wrap items-center gap-6">
            <Button size="lg" onClick={start} loading={busy} disabled={!consented}>Verify my ID</Button>
            {!consented && <span className="text-small text-ink-2">Tick the box above to continue.</span>}
          </div>
          <DemoComplete step="identity" label="Mark ID as verified" onDone={reload} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <Button variant="secondary" loading={checking} onClick={() => { setChecking(true); reload().finally(() => setChecking(false)); }}>Check again</Button>
          </div>
          <DemoComplete step="identity" label="Mark ID as verified" onDone={reload} />
        </div>
      )}
    </div>
  );
}

/** Demo-only: asks the API to mark a step done (needs DEMO_MODE=true on the Worker). */
function DemoComplete({ step, label, onDone }: { step: "bank" | "identity"; label: string; onDone: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true);
    setErr("");
    try {
      await http(`/demo/complete/${step}`, { method: "POST" });
      await onDone();
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404 ? "Demo mode is off on the API. Add DEMO_MODE=true to .dev.vars and restart wrangler dev." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <DemoButton label={label} onClick={run} busy={busy} />
      {err && <p role="alert" className="text-small text-danger">{err}</p>}
    </div>
  );
}
