import { useRef } from "react";
import { gsap, useGSAP, useReducedMotion, scrollToId, EASE_OUT } from "../lib/motion";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Stat } from "../ui/Stat";
import { STATS } from "./content";

const LINES = [
  { text: "Capital for the", indent: "" },
  { text: "business you", indent: "pl-[0.7em] lg:pl-[1.45em]" }, // em, so it scales with the type and works inside a fit-content block
  { text: "already run.", indent: "" },
];
// Phones: the first three lines run huge (22vw, poster-style); the tail drops to half size on one line,
// so the headline stays short enough for the street to show at the bottom of the first screen.
const MOBILE_LINES = [
  { text: "Capital", indent: "" },
  { text: "for the", indent: "pl-[0.6em]" },
  { text: "business", indent: "" },
  { text: "you already run.", indent: "mt-[0.12em] text-[0.5em] leading-[1] tracking-[-0.025em]" },
];
const HEADLINE = "Capital for the business you already run.";

/**
 * Three depth layers: street (back, lags), headline (middle), foliage (front, races past).
 * On scroll the leaves sweep up over the type while the street hangs back behind it.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      const intro = gsap.timeline({ defaults: { ease: EASE_OUT } });
      intro
        .from("[data-line] > span", { yPercent: 110, duration: 1.2, stagger: 0.09 }, 0.15)
        // intro moves `y` (px); scroll moves `yPercent` — separate channels so the two never fight
        .from("[data-street]", { y: 60, autoAlpha: 0, duration: 1.6 }, 0.25)
        .from("[data-foliage]", { y: 220, duration: 1.8 }, 0.35)
        .from("[data-corner='l']", { xPercent: -30, rotation: -6, autoAlpha: 0, duration: 1.8 }, 0.1)
        .from("[data-corner='r']", { xPercent: 30, rotation: 6, autoAlpha: 0, duration: 1.8 }, 0.1)
        .from("[data-deck] > *", { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.6);

      gsap
        .timeline({ scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: 0.5 } })
        .to("[data-street]", { yPercent: 14, ease: "none" }, 0)
        .to("[data-foliage]", { yPercent: -35, ease: "none" }, 0)
        // the top leaves part like curtains and rise faster than the page: nearest layer
        .to("[data-corner='l']", { xPercent: -24, yPercent: -45, rotation: -5, ease: "none" }, 0)
        .to("[data-corner='r']", { xPercent: 24, yPercent: -45, rotation: 5, ease: "none" }, 0);
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <>
      <section ref={root} className="relative isolate overflow-hidden">
        {/* top: hanging leaves framing the headline, behind the type so it always reads first; one image split in two halves so each side can part */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 flex">
          {/* each half renders the art at 80vw, anchored to its outer edge, so the clusters frame the type without touching it */}
          <div data-corner="l" className="flex w-1/2 origin-top-left justify-start overflow-hidden">
            <img src="/img/hero-corners.webp" alt="" className="block w-[160%] max-w-none" />
          </div>
          <div data-corner="r" className="flex w-1/2 origin-top-right justify-end overflow-hidden">
            <img src="/img/hero-corners.webp" alt="" className="block w-[160%] max-w-none" />
          </div>
        </div>

        {/* middle: the type */}
        <div className="relative z-10 pt-28 lg:pt-36">
          <Container>
            {/* the title sets the block width; the deck takes that width without widening it (w-0 + min-w-full) */}
            <div className="lg:mx-auto lg:w-fit">
            <h1 aria-label={HEADLINE} className="text-[22vw] leading-[0.86] font-semibold tracking-[-0.055em] sm:text-[clamp(2.75rem,10vw,10.5rem)] sm:leading-[0.9] sm:tracking-[-0.045em]">
              {MOBILE_LINES.map((l) => (
                <span key={l.text} aria-hidden data-line className={`block overflow-hidden pb-[0.06em] sm:hidden ${l.indent}`}>
                  <span className="block">{l.text}</span>
                </span>
              ))}
              {LINES.map((l) => (
                <span key={l.text} aria-hidden data-line className={`hidden overflow-hidden pb-[0.06em] sm:block ${l.indent}`}>
                  <span className="block">{l.text}</span>
                </span>
              ))}
            </h1>

            <div data-deck className="mt-8 flex flex-col gap-6 lg:mt-12 lg:w-0 lg:min-w-full xl:flex-row xl:items-end xl:justify-between xl:gap-10">
              <p className="max-w-[44ch] text-body text-ink-2 sm:text-body-lg">
                <span className="sm:hidden">$500 to $10,000 for your shop or stall. A decision in two business days.</span>
                <span className="hidden sm:inline">Loans from $500 to $10,000 for shops, workshops and market stalls. Apply in ten minutes. A loan officer replies within two business days.</span>
              </p>
              <div className="flex flex-col items-stretch gap-x-8 gap-y-3 sm:flex-row sm:flex-wrap sm:items-center xl:shrink-0 xl:flex-nowrap">
                <Button size="lg" className="w-full sm:w-auto" href="#rates" onClick={(e) => { e.preventDefault(); scrollToId("rates"); }}>
                  Check what you can borrow
                </Button>
                <Button variant="ghost" size="lg" href="#how" onClick={(e) => { e.preventDefault(); scrollToId("how"); }}>
                  How it works
                  <span aria-hidden className="transition-transform duration-250 group-hover:translate-x-1">→</span>
                </Button>
              </div>
            </div>
            </div>
          </Container>
        </div>

        {/* back: street (transparent cut-out), in flow right under the type so it never collides with it */}
        <img
          data-street
          src="/img/hero-street.webp"
          alt=""
          fetchPriority="high"
          className="pointer-events-none relative z-20 mt-6 -ml-[25%] block w-[150%] max-w-none sm:mx-auto sm:w-full lg:-z-10 lg:mt-4"
        />

        {/* front: foliage */}
        <img
          data-foliage
          src="/img/hero-foliage.webp"
          alt=""
          className="pointer-events-none absolute -bottom-[10%] -left-[4%] z-30 w-[108%] max-w-none lg:z-10 lg:-bottom-[18%]"
        />
      </section>

      <Container>
        <div className="grid gap-8 border-b border-line py-10 sm:grid-cols-3 lg:py-12">
          {STATS.map((s) => (
            <Stat key={s.label} value={s.value} label={s.label} format={s.format} />
          ))}
        </div>
      </Container>
    </>
  );
}
