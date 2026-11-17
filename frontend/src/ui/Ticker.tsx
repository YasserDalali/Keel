import { useRef } from "react";
import { gsap, useGSAP, useReducedMotion, EASE_OUT } from "../lib/motion";

/** Number that eases to its new value instead of jumping. */
export function Ticker({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (reduced) {
        shown.current = value;
        el.current!.textContent = format(value);
        return;
      }
      gsap.to(shown, {
        current: value,
        duration: 0.35,
        ease: EASE_OUT,
        overwrite: true,
        onUpdate: () => { el.current!.textContent = format(shown.current); },
      });
    },
    { dependencies: [value, reduced] },
  );
  return <span ref={el} className={className}>{format(value)}</span>;
}
