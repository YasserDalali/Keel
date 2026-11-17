import { useEffect, useRef } from "react";
import { getLenis } from "../lib/motion";

const INSET = 8; // px of breathing room above and below the thumb's travel

/**
 * Site-wide scrollbar for mouse users (the native one is hidden in tokens.css under `pointer: fine`).
 * A thin thumb that fades in while scrolling, widens on hover, drags, and jumps on track click.
 * Decorative for assistive tech: wheel, keyboard and touch scrolling are untouched.
 */
export function Scrollbar() {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tr = track.current!;
    const th = thumb.current!;
    const doc = document.documentElement;
    const max = () => doc.scrollHeight - innerHeight;
    const travel = () => innerHeight - th.offsetHeight - INSET * 2;
    const go = (y: number, immediate = true) => {
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(y, { immediate, force: true });
      else scrollTo({ top: y, behavior: immediate ? "auto" : "smooth" });
    };

    let dragging = false;
    let hideTimer = 0;
    let startY = 0;
    let startScroll = 0;

    const layout = () => {
      const m = max();
      tr.style.display = m <= 0 ? "none" : ""; // nothing to scroll: no bar
      th.style.height = `${Math.max(48, (innerHeight / doc.scrollHeight) * innerHeight)}px`;
      th.style.transform = `translateY(${(m > 0 ? scrollY / m : 0) * travel()}px)`;
    };
    const wake = () => {
      tr.toggleAttribute("data-active", true);
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (!dragging && !tr.matches(":hover")) tr.toggleAttribute("data-active", false);
      }, 1100);
    };

    const onScroll = () => { layout(); wake(); };
    const onThumbDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startY = e.clientY;
      startScroll = scrollY;
      th.setPointerCapture(e.pointerId);
      tr.toggleAttribute("data-dragging", true);
      wake();
    };
    const onThumbMove = (e: PointerEvent) => {
      if (!dragging) return;
      go(startScroll + ((e.clientY - startY) * max()) / travel());
    };
    const onThumbUp = () => {
      dragging = false;
      tr.toggleAttribute("data-dragging", false);
      wake();
    };
    // clicking the bare track centres the thumb on the click point
    const onTrackDown = (e: PointerEvent) => {
      if (e.target !== tr) return;
      const p = (e.clientY - INSET - th.offsetHeight / 2) / travel();
      go(Math.min(1, Math.max(0, p)) * max(), false);
    };

    layout();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", layout);
    const ro = new ResizeObserver(layout); // page height changes as sections and images load
    ro.observe(document.body);
    th.addEventListener("pointerdown", onThumbDown);
    th.addEventListener("pointermove", onThumbMove);
    th.addEventListener("pointerup", onThumbUp);
    th.addEventListener("pointercancel", onThumbUp);
    tr.addEventListener("pointerdown", onTrackDown);
    tr.addEventListener("pointerenter", wake);
    tr.addEventListener("pointerleave", wake);

    return () => {
      clearTimeout(hideTimer);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", layout);
      ro.disconnect();
      th.removeEventListener("pointerdown", onThumbDown);
      th.removeEventListener("pointermove", onThumbMove);
      th.removeEventListener("pointerup", onThumbUp);
      th.removeEventListener("pointercancel", onThumbUp);
      tr.removeEventListener("pointerdown", onTrackDown);
      tr.removeEventListener("pointerenter", wake);
      tr.removeEventListener("pointerleave", wake);
    };
  }, []);

  return (
    <div
      ref={track}
      aria-hidden
      className="group fixed inset-y-0 right-0 z-[60] hidden w-4 cursor-pointer opacity-0 transition-opacity duration-400 hover:opacity-100 data-[active]:opacity-100 [@media(pointer:fine)]:block"
    >
      <div
        ref={thumb}
        className="absolute top-2 right-1 w-1.5 cursor-grab touch-none rounded-[3px] bg-ink/35 transition-[width,background-color] duration-200 group-hover:w-2 group-hover:bg-ink/55 group-data-[dragging]:cursor-grabbing group-data-[dragging]:bg-accent-600"
      />
    </div>
  );
}
