import { useRef } from "react";
import { gsap, useGSAP, useReducedMotion, EASE_OUT } from "../lib/motion";

type Props = {
  src: string;
  alt: string;
  ratio: string;
  /** Scroll speed relative to the page: <1 lags behind (background), >1 runs ahead (foreground). */
  parallax?: number;
  reveal?: boolean;
  /** multiply-blend so white/cream art backgrounds disappear into the canvas */
  blend?: boolean;
  eager?: boolean;
  className?: string;
};

export function Art({ src, alt, ratio, parallax, reveal, blend, eager, className = "" }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      const img = wrap.current!.querySelector("img")!;
      if (parallax && parallax !== 1) {
        // framed art moves inside its frame (scaled so edges never show); free art moves itself
        const range = (1 - parallax) * (blend ? 60 : 40);
        gsap.fromTo(
          img,
          { yPercent: -range },
          { yPercent: range, ease: "none", scrollTrigger: { trigger: wrap.current, start: "top bottom", end: "bottom top", scrub: true } },
        );
      }
      if (reveal) {
        gsap.from(wrap.current, {
          clipPath: "inset(100% 0% 0% 0%)",
          duration: 1.1,
          ease: EASE_OUT,
          scrollTrigger: { trigger: wrap.current, start: "top 85%", once: true },
        });
      }
    },
    { scope: wrap, dependencies: [reduced, parallax, reveal, blend] },
  );

  const framed = !blend;
  return (
    <div
      ref={wrap}
      className={`relative ${framed ? "overflow-hidden" : ""} ${blend ? "mix-blend-multiply" : ""} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`absolute inset-0 size-full object-cover ${framed && parallax ? "scale-[1.15]" : ""}`}
      />
    </div>
  );
}
