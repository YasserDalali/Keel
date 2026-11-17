import { useEffect, useRef } from "react";
import { gsap } from "./motion";

/**
 * Always-live 3D tilt. Every registered card leans toward the cursor wherever it is on the page
 * (strongest when the cursor is on the card), and scrolling adds a lean from scroll speed and the
 * card's position in the viewport. One shared ticker drives every card; off-screen cards are skipped.
 * Hovering additionally zooms `inner` and shows `glare`. Reduced motion: no tilt at all.
 */

type Entry = {
  el: HTMLElement;
  max: number;
  shift: number;
  set: (nx: number, ny: number, lean: number) => void;
};

const entries = new Set<Entry>();
const pointer = { x: 0, y: 0, active: false };
let kick = 0; // smoothed scroll speed, -1 … 1
let lastY = 0;
let running = false;

const clamp = gsap.utils.clamp(-1, 1);
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function tick() {
  const dy = scrollY - lastY;
  lastY = scrollY;
  kick += (clamp(dy / 30) - kick) * 0.15;

  const vw = innerWidth, vh = innerHeight;
  for (const e of entries) {
    const r = e.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // falloff keeps the response continuous: full lean on the card, easing off with distance
    const nx = pointer.active ? clamp((pointer.x - cx) / (r.width / 2 + vw * 0.2)) : 0;
    const ny = pointer.active ? clamp((pointer.y - cy) / (r.height / 2 + vh * 0.2)) : 0;
    const lean = clamp((cy - vh / 2) / (vh / 2)) * 0.35 + kick; // cards lean back as they pass, and with scroll speed
    e.set(nx, ny, lean);
  }
}

function start() {
  if (running) return;
  running = true;
  lastY = scrollY;
  addEventListener(
    "pointermove",
    (ev) => {
      if (ev.pointerType !== "mouse") return;
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      pointer.active = true;
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => (pointer.active = false));
  gsap.ticker.add(tick);
}

export function useTilt({ max = 12, shift = 24, zoom = 1.1 } = {}) {
  const card = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLImageElement>(null);
  const glare = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion() || !card.current) return;
    const el = card.current;
    gsap.set(el, { transformPerspective: 800 });
    const to = (t: Element | null, prop: string, duration: number) =>
      t ? gsap.quickTo(t, prop, { duration, ease: "power3.out" }) : () => {};
    const rx = to(el, "rotationX", 0.45), ry = to(el, "rotationY", 0.45);
    const ax = to(inner.current, "x", 0.6), ay = to(inner.current, "y", 0.6);
    const gx = to(glare.current, "xPercent", 0.3), gy = to(glare.current, "yPercent", 0.3);

    const entry: Entry = {
      el,
      max,
      shift,
      set(nx, ny, lean) {
        ry(nx * max);
        rx(-ny * max + lean * max * 0.6);
        ax(-nx * shift);
        ay(-ny * shift);
        gx(nx * 50);
        gy(ny * 50);
      },
    };
    entries.add(entry);
    start();
    return () => {
      entries.delete(entry);
      gsap.killTweensOf([el, inner.current, glare.current].filter(Boolean));
    };
  }, [max, shift]);

  const handlers = {
    onPointerEnter() {
      if (reducedMotion()) return;
      if (inner.current) gsap.to(inner.current, { scale: zoom, duration: 0.8, ease: "power3.out" });
      if (glare.current) gsap.to(glare.current, { autoAlpha: 1, duration: 0.4 });
    },
    onPointerLeave() {
      if (inner.current) gsap.to(inner.current, { scale: 1, duration: 0.9, ease: "power3.out" });
      if (glare.current) gsap.to(glare.current, { autoAlpha: 0, duration: 0.5 });
    },
  };

  return { card, inner, glare, handlers };
}
