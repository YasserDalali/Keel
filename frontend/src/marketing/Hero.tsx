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
        .to("[data-type]", { yPercent: 35, ease: "none" }, 0)
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
        <div data-type className="relative z-10 pt-28 lg:pt-36">
          <Container>
            {/* the title sets the block width; the deck takes that width without widening it (w-0 + min-w-full) */}
            <div className="lg:mx-auto lg:w-fit">
            <h1 className="text-[clamp(2.75rem,10vw,10.5rem)] leading-[0.9] font-semibold tracking-[-0.045em]">
              {LINES.map((l) => (
                <span key={l.text} data-line className={`block overflow-hidden pb-[0.06em] ${l.indent}`}>
                  <span className="block">{l.text}</span>
                </span>
              ))}
            </h1>

            <div data-deck className="mt-8 flex flex-col gap-6 lg:mt-12 lg:w-0 lg:min-w-full xl:flex-row xl:items-end xl:justify-between xl:gap-10">
              <p className="max-w-[44ch] text-body-lg text-ink-2">
                Loans from $500 to $10,000 for shops, workshops and market stalls. Apply in ten minutes. A loan officer replies within two business days.
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4 xl:shrink-0 xl:flex-nowrap">
                <Button size="lg" href="#rates" onClick={(e) => { e.preventDefault(); scrollToId("rates"); }}>
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
          className="relative -z-10 mt-6 -ml-[25%] block w-[150%] max-w-none sm:mx-auto sm:w-full lg:mt-4"
        />

        {/* front: foliage */}
        <img
          data-foliage
          src="/img/hero-foliage.webp"
          alt=""
          className="pointer-events-none absolute -bottom-[10%] -left-[4%] z-10 w-[108%] max-w-none lg:-bottom-[18%]"
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
