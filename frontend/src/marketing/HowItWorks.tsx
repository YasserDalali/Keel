import { useRef, type ReactNode } from "react";
import { usd } from "../lib/format";
import { quote } from "../lib/loan-terms";
import { gsap, useGSAP } from "../lib/motion";
import { useTilt } from "../lib/useTilt";
import { Container } from "../ui/Container";

const STEPS = [
  { title: "Verify your ID", body: "Photograph your ID. We read the details for you, you confirm them." },
  { title: "Connect your bank", body: "Read-only access to see your cash flow. We never move money from it." },
  { title: "Apply", body: "Choose an amount and a term. A loan officer reviews it, usually within two business days." },
  { title: "Repay monthly", body: "Fixed monthly payments. Pay early any time at no cost." },
];

const AMOUNT = 2400;
const TERM = 6;
const q = quote(AMOUNT, TERM);
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const schedule = Array.from({ length: TERM }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() + i + 1);
  return day.format(d);
});

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-art bg-surface p-6 shadow-float-2 sm:p-8">
      <p className="text-label text-ink-2">{title}</p>
      <div className="mt-6 flex flex-col">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div data-r className="flex items-baseline justify-between gap-6 border-b border-line py-3 last:border-0">
      <span className="text-small text-ink-2">{label}</span>
      <span className={`tabular text-right ${strong ? "text-h3" : "text-body"}`}>{value}</span>
    </div>
  );
}

const Check = () => (
  <svg viewBox="0 0 16 16" className="size-4 text-accent-600" aria-hidden>
    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const inflows = [2650, 3010, 2890, 3420, 3180, 3560];

const PANELS = [
  <Panel title="Identity check" key="id">
    <Row label="First name" value="Amina" />
    <Row label="Last name" value="Diallo" />
    <Row label="ID number" value="SN 2048 1173 0042" />
    <Row label="Date of birth" value="14 Mar 1984" />
    <div data-r className="mt-4 flex items-center gap-2 text-small text-accent-700"><Check /> Details confirmed</div>
  </Panel>,
  <Panel title="Bank connection" key="bank">
    <div data-r className="flex items-center gap-4 border-b border-line pb-4">
      <span className="flex size-10 items-center justify-center rounded-control bg-ink text-small font-semibold text-canvas">E</span>
      <span className="flex flex-col">
        <span className="text-body">Ecobank · Current account ••4471</span>
        <span className="text-small text-accent-700">Connected, read-only</span>
      </span>
    </div>
    <div data-r className="flex items-end justify-between gap-6 pt-6">
      <span className="flex flex-col gap-1">
        <span className="text-small text-ink-2">Average monthly inflow</span>
        <span className="tabular text-h2">{usd(3180)}</span>
      </span>
      <span className="flex h-16 items-end gap-1.5" aria-hidden>
        {inflows.map((v, i) => (
          <span key={i} data-bar className="w-3 origin-bottom rounded-[2px] bg-mint" style={{ height: `${(v / 3600) * 100}%` }} />
        ))}
      </span>
    </div>
  </Panel>,
  <Panel title="Loan application" key="apply">
    <Row label="Amount" value={usd(AMOUNT)} strong />
    <Row label="Term" value={`${TERM} months`} />
    <Row label="Monthly payment" value={usd(q.monthly)} />
    <Row label="Fee, one time" value={usd(q.fee)} />
    <div data-r className="mt-4 flex items-center gap-2 text-small text-ink-2">
      <span className="size-2 rounded-full bg-mustard" /> With a loan officer
    </div>
  </Panel>,
  <Panel title="Repayment schedule" key="repay">
    {schedule.map((d, i) => (
      <Row
        key={d}
        label={d}
        value={
          <span className="inline-flex items-center gap-3">
            <span className={`text-small ${i === 0 ? "text-accent-700" : i === 1 ? "text-ink" : "text-ink-3"}`}>
              {i === 0 ? "Paid" : i === 1 ? "Next" : ""}
            </span>
            {usd(q.monthly)}
          </span>
        }
      />
    ))}
  </Panel>,
];

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const tilt = useTilt({ max: 9 });

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // quick entrance as the section arrives: heading, steps, then the panel swings up into place
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const st = { trigger: root.current, start: "top 80%", once: true };
        gsap
          .timeline({ defaults: { ease: "expo.out" }, scrollTrigger: st })
          .from("[data-how-title]", { y: 32, autoAlpha: 0, duration: 0.7 }, 0)
          .from("[data-how-list]", { autoAlpha: 0, duration: 0.4 }, 0.1)
          .from("[data-how-list] > li", { x: -24, duration: 0.6, stagger: 0.05 }, 0.1)
          .from("[data-how-enter]", { y: 80, rotationX: 14, transformPerspective: 1000, autoAlpha: 0, duration: 0.8 }, 0.15);
      });

      // phones: step text + one card pinned under the nav, swapping as you scroll
      mm.add("(max-width: 1023px) and (prefers-reduced-motion: no-preference)", () => {
        const panels = gsap.utils.toArray<HTMLElement>("[data-mpanel]");
        const steps = gsap.utils.toArray<HTMLElement>("[data-mstep]");
        const fills = gsap.utils.toArray<HTMLElement>("[data-mfill]");
        gsap.set(panels.slice(1), { autoAlpha: 0, y: 24 });
        gsap.set(steps.slice(1), { autoAlpha: 0, y: 12 });
        gsap.set(fills[0], { scaleX: 1 });

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut", duration: 0.3 },
          scrollTrigger: { trigger: "[data-mpin]", start: "top 88px", end: "+=220%", pin: true, scrub: 0.6 },
        });
        for (let i = 1; i < panels.length; i++) {
          const at = i - 0.5;
          tl.to(panels[i - 1], { autoAlpha: 0, y: -24 }, at)
            .to(steps[i - 1], { autoAlpha: 0, y: -12 }, at)
            .fromTo(panels[i], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0 }, at + 0.05)
            .fromTo(steps[i], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0 }, at + 0.05)
            .to(fills[i], { scaleX: 1 }, at)
            .from(panels[i].querySelectorAll("[data-r]"), { autoAlpha: 0, y: 10, stagger: 0.03 }, at + 0.1);
          if (i === 1) tl.from(panels[i].querySelectorAll("[data-bar]"), { scaleY: 0, stagger: 0.03 }, at + 0.12);
        }
        tl.to({}, { duration: 0.5 }); // hold the last card before unpinning
      });

      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const panels = gsap.utils.toArray<HTMLElement>("[data-panel]");
        const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
        gsap.set(panels.slice(1), { autoAlpha: 0, y: 24 });
        gsap.set(steps.slice(1), { opacity: 0.32 });
        gsap.set("[data-rule]", { scaleY: 0.25 });

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut", duration: 0.3 },
          scrollTrigger: { trigger: root.current, start: "top top", end: "+=300%", pin: true, scrub: 0.6 },
        });
        for (let i = 1; i < panels.length; i++) {
          const at = i - 0.5;
          tl.to(panels[i - 1], { autoAlpha: 0, y: -24 }, at)
            .to(steps[i - 1], { opacity: 0.32 }, at)
            .fromTo(panels[i], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0 }, at + 0.05)
            .to(steps[i], { opacity: 1 }, at)
            .to("[data-rule]", { scaleY: (i + 1) / panels.length }, at)
            .from(panels[i].querySelectorAll("[data-r]"), { autoAlpha: 0, y: 10, stagger: 0.03 }, at + 0.1);
          if (i === 1) tl.from(panels[i].querySelectorAll("[data-bar]"), { scaleY: 0, stagger: 0.03 }, at + 0.12);
        }
        tl.to({}, { duration: 0.5 }); // hold the last state before unpinning
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" className="bg-canvas">
      <Container className="grid gap-12 py-24 lg:min-h-dvh lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-28">
        <div className="lg:col-span-5">
          <h2 data-how-title className="text-h1 max-w-[12ch]">From application to first payment</h2>
          <div className="relative mt-10 lg:mt-12 lg:pl-8">
            <span className="absolute top-0 bottom-0 left-0 hidden w-px bg-line lg:block" />
            <span data-rule className="absolute top-0 bottom-0 left-0 hidden w-[2px] origin-top bg-accent-600 lg:block" />
            <ol data-how-list className="hidden flex-col gap-10 lg:flex motion-reduce:flex">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-6">
                  <div data-step className="flex gap-5">
                    <span className="tabular text-h3 text-ink-2">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex flex-col gap-2">
                      <h3 className="text-h3">{s.title}</h3>
                      <p className="max-w-[38ch] text-body text-ink-2">{s.body}</p>
                    </div>
                  </div>
                  <div className="hidden motion-reduce:block" aria-hidden>{PANELS[i]}</div>
                </li>
              ))}
            </ol>

            <div data-mpin className="flex flex-col gap-6 lg:hidden motion-reduce:hidden">
              <div className="grid">
                {STEPS.map((s, i) => (
                  <div key={s.title} data-mstep className="col-start-1 row-start-1 flex gap-5">
                    <span className="tabular text-h3 text-ink-2">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex flex-col gap-2">
                      <h3 className="text-h3">{s.title}</h3>
                      <p className="max-w-[38ch] text-body text-ink-2">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5" aria-hidden>
                {STEPS.map((s) => (
                  <span key={s.title} className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
                    <span data-mfill className="block h-full origin-left scale-x-0 bg-accent-600" />
                  </span>
                ))}
              </div>
              <div className="grid" aria-hidden>
                {PANELS.map((p, i) => (
                  <div key={i} data-mpanel className="col-start-1 row-start-1 self-start">{p}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="relative hidden lg:col-span-6 lg:col-start-7 lg:block motion-reduce:lg:hidden" aria-hidden>
          <div data-how-enter>
            {/* tilt sits on its own wrapper so it never fights the entrance or the pinned crossfades */}
            <div ref={tilt.card} {...tilt.handlers} className="grid will-change-transform">
              {PANELS.map((p, i) => (
                <div key={i} data-panel className="col-start-1 row-start-1 self-center">{p}</div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
