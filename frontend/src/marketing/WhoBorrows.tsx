import { useRef } from "react";
import { usd } from "../lib/format";
import { gsap, useGSAP, useReducedMotion } from "../lib/motion";
import { Container } from "../ui/Container";
import { useTilt } from "../lib/useTilt";
import { BORROWERS, FEATURED } from "./content";
import { quote } from "../lib/loan-terms";

type Borrower = (typeof BORROWERS)[number];

/** Card tilts toward the cursor; the art slides the other way inside it and a soft light follows the pointer. */
function Tile({ b, hidden }: { b: Borrower; hidden?: boolean }) {
  const { card, inner: art, glare, handlers } = useTilt();

  return (
    <figure className="w-[240px] shrink-0 snap-start sm:w-[280px] lg:w-[320px]" aria-hidden={hidden || undefined}>
      <div
        ref={card}
        {...handlers}
        className="relative overflow-hidden rounded-art bg-mint-50 will-change-transform [transform-style:preserve-3d]"
        style={{ aspectRatio: "3/4" }}
      >
        <img ref={art} src={`/img/${b.img}.webp`} alt="" loading="lazy" className="size-full scale-100 object-cover" />
        <span
          ref={glare}
          aria-hidden
          className="pointer-events-none invisible absolute inset-[-50%] opacity-0 [background:radial-gradient(circle_at_center,rgb(255_255_255/0.45),transparent_45%)] mix-blend-soft-light"
        />
      </div>
      <figcaption className="mt-4 flex flex-col gap-1">
        <span className="text-h3">{b.name}</span>
        <span className="text-small text-ink-2">{b.business} · {b.city}</span>
        <span className="tabular text-small text-accent-700">{usd(b.amount)} for {b.purpose}</span>
      </figcaption>
    </figure>
  );
}

/** Amina's loan, told as a quote and the repayment ledger it produced. */
function Story() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const amina = BORROWERS[0];
  const monthly = quote(amina.amount, FEATURED.term).monthly;

  useGSAP(
    () => {
      if (reduced) return;
      const st = { trigger: root.current, start: "top 75%", once: true };
      gsap.from("[data-seg]", { scaleY: 0, transformOrigin: "bottom", duration: 0.6, stagger: 0.05, ease: "expo.out", scrollTrigger: st });
      gsap.from("[data-story] > *", { y: 16, autoAlpha: 0, duration: 0.8, stagger: 0.08, ease: "expo.out", scrollTrigger: st });
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <figure ref={root} data-story className="flex flex-col gap-8 border-t border-line pt-8 lg:col-span-6 lg:self-end">
      <blockquote className="text-h2 max-w-[22ch]"><p>“{FEATURED.quote}”</p></blockquote>
      <figcaption className="text-body">
        {amina.name} <span className="text-ink-2">· {amina.business}, {amina.city}</span>
      </figcaption>
      <div className="flex flex-col gap-4">
        <dl className="tabular grid grid-cols-3 gap-6">
          {[
            ["Borrowed", usd(amina.amount)],
            ["Monthly", usd(monthly)],
            ["Repaid", `${FEATURED.paid} of ${FEATURED.term}`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <dt className="text-small text-ink-2">{k}</dt>
              <dd className="text-h3">{v}</dd>
            </div>
          ))}
        </dl>
        {/* one segment per monthly payment */}
        <div className="flex h-8 items-end gap-1.5" aria-label={`${FEATURED.paid} of ${FEATURED.term} payments made`} role="img">
          {Array.from({ length: FEATURED.term }, (_, i) => (
            <span
              key={i}
              data-seg
              className={`flex-1 rounded-[3px] ${
                i < FEATURED.paid ? "h-full bg-accent-600" : i === FEATURED.paid ? "h-full border border-dashed border-accent-600" : "h-1/3 bg-line-strong"
              }`}
            />
          ))}
        </div>
        <p className="text-small text-ink-2">For {amina.purpose}. Next payment due on the 18th.</p>
      </div>
    </figure>
  );
}

export function WhoBorrows() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const others = BORROWERS.slice(1); // Amina is featured above the rows
  const rows = [others.slice(0, 3), others.slice(3)];

  useGSAP(
    () => {
      if (reduced) return;
      const st = { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.8 };
      gsap.fromTo("[data-row='0']", { xPercent: 0 }, { xPercent: -14, ease: "none", scrollTrigger: st });
      gsap.fromTo("[data-row='1']", { xPercent: -18 }, { xPercent: -4, ease: "none", scrollTrigger: st });
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <section ref={root} className="overflow-hidden pt-14 pb-24 lg:pt-20 lg:pb-32">
      <Container className="grid gap-10 pb-20 lg:grid-cols-12 lg:gap-x-10">
        <div className="flex flex-col gap-8 lg:col-span-6">
          <h2 className="text-[clamp(3rem,6.5vw,6rem)] leading-[0.95] font-semibold tracking-[-0.035em]">Who borrows with Keel</h2>
          <p className="max-w-[40ch] text-body-lg text-ink-2">
            Owners of small, busy businesses who know exactly what the money is for.
          </p>
        </div>

        {/* the tailor stays still on purpose: the rows below carry the motion */}
        <img
          src="/img/hero-tailor.webp"
          alt="Amina Diallo at her sewing machine"
          loading="lazy"
          className="aspect-[1200/1608] w-[88%] max-w-[600px] object-contain mix-blend-multiply justify-self-center lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:w-full lg:justify-self-end lg:self-end"
        />

        <Story />
      </Container>
      <div className="flex flex-col gap-14">
        {rows.map((row, r) => (
          <div
            key={r}
            data-row={r}
            className={`flex gap-6 px-6 lg:gap-8 lg:px-10 ${reduced ? "snap-x overflow-x-auto pb-4" : "w-max"}`}
          >
            {(reduced ? row : [...row, ...row]).map((b, i) => (
              <Tile key={`${b.name}-${i}`} b={b} hidden={i >= row.length} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
