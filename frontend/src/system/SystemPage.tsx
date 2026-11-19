import { useState, type ReactNode } from "react";
import { Art } from "../ui/Art";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../ui/Segmented";
import { Select } from "../ui/Select";
import { MonthlyBars } from "../app/charts";
import { DemoFill, demoProfile } from "../ui/DemoFill";
import { Skeleton } from "../ui/Skeleton";
import { Slider } from "../ui/Slider";
import { Status } from "../ui/Status";
import { Container } from "../ui/Container";
import { Stat } from "../ui/Stat";
import { TextField } from "../ui/TextField";
import { TextLink } from "../ui/TextLink";
import { Wordmark, Mark } from "../ui/Wordmark";
import { usd } from "../lib/format";

const colors: [string, string, string][] = [
  ["canvas", "#F7F6F2", "Page background"],
  ["surface", "#FDFCFA", "Inputs, menus, panels"],
  ["ink", "#14271F", "Primary text, dark sections"],
  ["ink-2", "#5D6963", "Secondary text · 5.3:1"],
  ["ink-3", "#78827C", "Large or inactive text only · 3.7:1"],
  ["accent-600", "#1F7A4D", "Primary actions, links"],
  ["accent-700", "#18623E", "Hover, key figures"],
  ["danger", "#B42318", "Errors"],
  ["mint", "#7FD1AE", "Illustration"],
  ["mint-50", "#D8EFE2", "Illustration tiles"],
  ["mustard", "#C9A43A", "Illustration"],
  ["lilac", "#B59BD9", "Illustration, rare"],
];

const type: [string, string, string][] = [
  ["text-display", "Display", "clamp(48–104px) · 0.95 · −3.5% · 600"],
  ["text-h1", "Heading one", "clamp(36–60px) · 1.0 · −3% · 600"],
  ["text-h2", "Heading two", "clamp(28–40px) · 1.1 · −2% · 600"],
  ["text-h3", "Heading three", "22px · 1.25 · −1% · 500"],
  ["text-body-lg", "Body large for introductions", "19px · 1.55 · 400"],
  ["text-body", "Body for everything people read", "17px · 1.55 · 400"],
  ["text-small", "Small for captions and hints", "14px · 1.5 · 400"],
  ["text-label", "Label for form fields", "13px · 1.4 · 500"],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-8 border-t border-line py-16 lg:grid-cols-12">
      <h2 className="text-label text-ink-2 lg:col-span-3">{title}</h2>
      <div className="lg:col-span-9">{children}</div>
    </section>
  );
}

export default function SystemPage() {
  return (
    <Container as="main" className="py-16">
      <header className="flex flex-col gap-6 pb-16">
        <Wordmark className="text-h3" />
        <h1 className="text-h1 max-w-[18ch]">Keel design system</h1>
        <p className="max-w-[60ch] text-body-lg text-ink-2">
          The tokens and components every Keel page is built from. If something on a page isn't here, it shouldn't be on the page.
        </p>
      </header>

      <Section title="Colour">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {colors.map(([name, hex, use]) => (
            <li key={name} className="flex flex-col gap-3">
              <span className="h-20 rounded-control border border-line" style={{ background: hex }} />
              <span className="flex flex-col">
                <span className="text-body font-medium">{name}</span>
                <span className="tabular text-small text-ink-2">{hex}</span>
                <span className="text-small text-ink-2">{use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type · General Sans">
        <ul className="flex flex-col gap-10">
          {type.map(([cls, sample, spec]) => (
            <li key={cls} className="flex flex-col gap-2">
              <span className={cls}>{sample}</span>
              <span className="text-small text-ink-2">{cls} · {spec}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Space">
        <ul className="flex flex-col gap-3">
          {[4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160].map((n) => (
            <li key={n} className="flex items-center gap-4">
              <span className="tabular w-12 text-small text-ink-2">{n}</span>
              <span className="h-3 rounded-[2px] bg-accent-600" style={{ width: n }} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Depth">
        <div className="grid gap-8 sm:grid-cols-2">
          {(["shadow-float-1", "shadow-float-2"] as const).map((s) => (
            <div key={s} className={`flex h-32 items-end rounded-art bg-surface p-5 ${s}`}>
              <span className="text-small text-ink-2">{s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-4">
            <Button>Apply now</Button>
            <Button variant="secondary">How it works</Button>
            <Button variant="ghost">Learn about rates</Button>
            <Button loading>Apply now</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg">Check what you can borrow</Button>
            <Button size="lg" variant="secondary">Sign in</Button>
          </div>
        </div>
      </Section>

      <Section title="Fields">
        <form className="grid max-w-[400px] gap-6" onSubmit={(e) => e.preventDefault()}>
          <TextField label="Email" type="email" autoComplete="off" />
          <TextField label="Password" type="password" hint="At least 8 characters" autoComplete="off" />
          <TextField label="Email" type="email" defaultValue="amina@" error="Enter an email address like name@example.com." autoComplete="off" />
        </form>
      </Section>

      <Section title="App states">
        <AppStates />
      </Section>

      <Section title="Choices and charts">
        <ChoicesAndCharts />
      </Section>

      <Section title="Links, figures, art">
        <div className="grid gap-12 sm:grid-cols-2">
          <div className="flex flex-col gap-8">
            <p className="text-body">
              Read <TextLink href="#">how repayments work</TextLink> before you apply.
            </p>
            <Stat value={12480} label="Loans funded since 2023" format={(n) => Math.round(n).toLocaleString("en-US")} />
            <p className="tabular text-h1 text-accent-700">{usd(210)}<span className="text-body text-ink-2"> a month</span></p>
            <Mark className="size-16" />
          </div>
          <Art src="/img/tile-sewing.webp" alt="Sewing machine" ratio="3/4" className="rounded-art bg-mint-50" parallax={0.85} />
        </div>
      </Section>
    </Container>
  );
}

function AppStates() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(2400);
  return (
    <div className="grid gap-12 sm:grid-cols-2">
      <div className="flex flex-col gap-4">
        <span className="text-label text-ink-2">Status · dot and word, never a pill</span>
        <Status tone="accent">Repaying</Status>
        <Status tone="warning">With a loan officer</Status>
        <Status tone="danger">Overdue</Status>
        <Status tone="muted">Paid off</Status>
      </div>
      <div className="flex flex-col gap-6">
        <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
          <DemoFill values={() => ({ demoName: demoProfile().firstName })} />
          <TextField label="First name" name="demoName" autoComplete="off" hint="Demo buttons show only while the API runs with DEMO_MODE=true" />
        </form>
        <Checkbox defaultChecked>I agree to verify my identity with Didit.</Checkbox>
        <Slider label="Amount" value={v} min={500} max={10000} step={100} format={usd} onChange={setV} />
        <div className="flex flex-col gap-3" aria-label="Loading">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>Open dialog</Button>
        </div>
        <Dialog open={open} onClose={() => setOpen(false)} title="Decline this application?">
          <p className="text-body text-ink-2">Native dialog: focus is trapped, Escape and the backdrop close it.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>Keep it</Button>
            <Button onClick={() => setOpen(false)}>Decline application</Button>
          </div>
        </Dialog>
      </div>
    </div>
  );
}

function ChoicesAndCharts() {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end gap-8">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: "calendar", label: "Calendar" }, { value: "list", label: "List" }]} />
        <Select label="Loan" className="w-56" defaultValue="all">
          <option value="all">All loans</option>
          <option value="a">37AAEA46 · $2,400</option>
        </Select>
      </div>
      <MonthlyBars
        data={[
          { month: "2026-09", due: 210, repaid: 210 },
          { month: "2026-10", due: 210, repaid: 210 },
          { month: "2026-11", due: 560, repaid: 400 },
          { month: "2026-12", due: 560, repaid: 0 },
        ]}
      />
    </div>
  );
}
