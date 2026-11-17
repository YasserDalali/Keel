import { useEffect, useSyncExternalStore } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
export { gsap, ScrollTrigger, SplitText, useGSAP };

export const EASE_OUT = "expo.out";
export const EASE_IN_OUT = "expo.inOut";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false);

let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/** Weighted smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in sync. Call once at the root. */
export function useSmoothScroll() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    lenis = new Lenis({ lerp: 0.1 });
    if (import.meta.env.DEV) Object.assign(window, { __lenis: lenis }); // lets dev tooling scroll programmatically
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis?.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis?.destroy();
      lenis = null;
    };
  }, [reduced]);
}

/** Scroll to an element id, smooth unless reduced motion. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -24, duration: 1.4 });
  else el.scrollIntoView({ behavior: "auto" });
}
