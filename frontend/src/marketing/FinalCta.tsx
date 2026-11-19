import { useRef, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { usd } from "../lib/format";
import { quote } from "../lib/loan-terms";
import { gsap, useGSAP, useReducedMotion } from "../lib/motion";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { TextLink } from "../ui/TextLink";

const AMOUNTS = [1000, 2500, 5000];
const TERM = 12;
// Facts already stated elsewhere on the landing page (calculator, hero, how it works).
const TRUST = ["One flat 5% fee, shown before you sign", "A loan officer decides in about two business days", "No penalty for paying early"];

const Check = () => (
  <svg viewBox="0 0 16 16" className="mt-[3px] size-4 shrink-0 text-accent-600" aria-hidden>
    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Pulls its child a few pixels toward the pointer (transform only). Off for touch and reduced motion. */
function Magnetic({ children }: { children: ReactNode }) {
  const el = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const move = (e: PointerEvent) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = el.current!.getBoundingClientRect();
    gsap.to(el.current, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: "expo.out" });
  };
  const leave = () => gsap.to(el.current, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
  return (
    <span ref={el} onPointerMove={move} onPointerLeave={leave} className="inline-block will-change-transform">
      {children}
    </span>
  );
}

export function FinalCta() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { ease: "expo.out" }, scrollTrigger: { trigger: root.current, start: "top 75%", once: true } })
          .from("[data-cta-panel]", { y: 60, autoAlpha: 0, duration: 1 }, 0)
          .from("[data-cta-art]", { clipPath: "inset(0% 0% 0% 100%)", duration: 1.2, ease: "expo.inOut" }, 0.1)
          .from("[data-cta-art] img", { scale: 1.15, duration: 1.8 }, 0.1)
          .from("[data-cta-line]", { yPercent: 110, duration: 0.9, stagger: 0.08 }, 0.2)
          .from("[data-cta-in]", { y: 20, autoAlpha: 0, duration: 0.7, stagger: 0.06 }, 0.45);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="pb-24 lg:pb-32">
      <Container>
        <div data-cta-panel className="grid overflow-hidden rounded-[24px] bg-mint-50 lg:grid-cols-12">
          <div className="flex flex-col gap-10 p-6 py-10 sm:p-12 lg:col-span-7 lg:p-16">
            <div className="flex flex-col gap-5">
              <p data-cta-in className="text-label text-accent-700">Apply in about ten minutes</p>
              <h2 className="text-[clamp(2.5rem,6vw,5.25rem)] leading-[0.95] font-semibold tracking-[-0.04em]">
                <span className="block overflow-hidden pb-[0.06em]"><span data-cta-line className="block">Ready when</span></span>
                <span className="block overflow-hidden pb-[0.06em]"><span data-cta-line className="block">your next order is.</span></span>
              </h2>
              <p data-cta-in className="max-w-[44ch] text-body-lg text-ink-2">
                Pick a starting amount. You'll see the exact monthly payment before you sign anything.
              </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-3">
              {AMOUNTS.map((a) => (
                <li key={a} data-cta-in>
                  <Link
                    to="/signup"
                    className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 rounded-control border border-ink/10 bg-surface px-5 py-4 shadow-float-1 sm:flex sm:h-full sm:flex-col sm:items-stretch sm:gap-1 sm:p-5 transition-[transform,border-color,box-shadow] duration-250 ease-out-expo hover:-translate-y-1 hover:border-ink hover:shadow-float-2"
                  >
                    <span className="tabular text-h3 sm:text-h2">{usd(a)}</span>
                    <span className="tabular col-start-1 text-small text-ink-2">about {usd(Math.round(quote(a, TERM).monthly))} a month over {TERM} months</span>
                    {/* phones: a compact row, the arrow carries the action */}
                    <span className="col-start-2 row-span-2 row-start-1 inline-flex items-center gap-2 text-small font-medium text-accent-700 sm:mt-3">
                      <span className="sr-only sm:not-sr-only">Start with {usd(a)}</span>
                      <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-250 ease-out-expo group-hover:translate-x-1" aria-hidden>
                        <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div data-cta-in className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <Magnetic>
                <Button size="lg" to="/signup" className="w-full sm:w-auto">Create your account</Button>
              </Magnetic>
              <p className="text-body text-ink-2">
                Already with Keel? <TextLink to="/signin" className="font-medium text-ink">Sign in</TextLink>
              </p>
            </div>

            <ul data-cta-in className="flex flex-col gap-2 border-t border-ink/10 pt-6 sm:flex-row sm:flex-wrap sm:gap-x-8">
              {TRUST.map((t) => (
                <li key={t} className="flex items-start gap-2 text-small text-ink-2"><Check />{t}</li>
              ))}
            </ul>
          </div>

          <div data-cta-art className="relative min-h-[240px] overflow-hidden sm:min-h-[320px] lg:col-span-5 lg:min-h-full" aria-hidden>
            <img src="/img/app-loans.webp" alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain object-center p-6 lg:p-10" />
          </div>
        </div>
      </Container>
    </section>
  );
}
