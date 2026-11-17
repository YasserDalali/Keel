import { useRef } from "react";
import { gsap, SplitText, useGSAP, useReducedMotion, EASE_OUT } from "../lib/motion";
import { Container } from "../ui/Container";

const POINTS = [
  { title: "Your ID is read once and encrypted.", body: "Personal details are stored encrypted (AES-GCM). Our staff see them only when reviewing your loan." },
  { title: "We read your bank, we never touch it.", body: "Bank access is read-only and you can disconnect it any time." },
  { title: "A person decides.", body: "Every loan is reviewed by a loan officer, not only a score." },
];

export function Trust() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      gsap.utils.toArray<HTMLElement>("[data-point]").forEach((el) => {
        const st = { trigger: el, start: "top 80%", once: true };
        SplitText.create(el.querySelector("h3")!, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 1.1, stagger: 0.08, ease: EASE_OUT, scrollTrigger: st }),
        });
        gsap.from(el.querySelector("p"), { y: 16, autoAlpha: 0, duration: 0.9, delay: 0.25, ease: EASE_OUT, scrollTrigger: st });
        gsap.from(el.querySelector("[data-line]"), { scaleX: 0, duration: 1.2, ease: "expo.inOut", scrollTrigger: st });
      });
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <section ref={root} className="bg-ink py-28 text-canvas lg:py-40">
      <Container>
        <h2 className="text-label text-mint">How we look after you</h2>
        <div className="mt-12 flex flex-col">
          {POINTS.map((p) => (
            <div key={p.title} data-point className="relative grid gap-4 py-12 lg:grid-cols-12 lg:gap-10 lg:py-16">
              <span data-line className="absolute inset-x-0 top-0 h-px origin-left bg-canvas/15" />
              <h3 className="text-h1 lg:col-span-7">{p.title}</h3>
              <p className="max-w-[40ch] text-body-lg text-canvas/70 lg:col-span-4 lg:col-start-9 lg:pt-3">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
