import { useRef } from "react";
import { gsap, useGSAP, useReducedMotion, EASE_OUT } from "../lib/motion";

export function Stat({ value, label, format }: { value: number; label: string; format: (n: number) => string }) {
  const num = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      const o = { v: 0 };
      gsap.to(o, {
        v: value,
        duration: 1.4,
        ease: EASE_OUT,
        scrollTrigger: { trigger: num.current, start: "top bottom", once: true },
        onUpdate: () => { num.current!.textContent = format(o.v); },
      });
    },
    { dependencies: [reduced, value] },
  );

  return (
    <div className="flex flex-col gap-1">
      <span ref={num} className="tabular text-h2 text-ink">{format(value)}</span>
      <span className="text-small text-ink-2">{label}</span>
    </div>
  );
}
