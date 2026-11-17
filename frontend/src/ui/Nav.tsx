import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useAuth } from "../lib/auth";
import { gsap, ScrollTrigger, useGSAP, useReducedMotion, scrollToId, EASE_OUT, getLenis } from "../lib/motion";
import { Button } from "./Button";
import { Container } from "./Container";
import { Wordmark } from "./Wordmark";

const anchors = [
  { id: "how", label: "How it works" },
  { id: "rates", label: "Rates" },
];

export function Nav() {
  const { user } = useAuth();
  const bar = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  // hidden over the hero's top leaves; slides in once you start scrolling, and whenever it takes keyboard focus
  const SHOW_AFTER = 80;
  const show = (on: boolean) =>
    gsap.to(bar.current, { yPercent: on ? 0 : -100, duration: reduced ? 0 : 0.7, ease: on ? EASE_OUT : "expo.in", overwrite: true });

  useGSAP(() => {
    gsap.set(bar.current, { yPercent: scrollY > SHOW_AFTER ? 0 : -100 });
    ScrollTrigger.create({ start: SHOW_AFTER, end: "max", onToggle: (self) => show(self.isActive || open) });
  }, [reduced]);

  useGSAP(() => {
    if (!open || reduced) return;
    gsap.from(sheet.current!.querySelectorAll("[data-item]"), { y: 24, autoAlpha: 0, duration: 0.6, stagger: 0.06, ease: EASE_OUT });
  }, [open, reduced]);

  useEffect(() => {
    if (!open) return;
    const lenis = getLenis();
    lenis?.stop();
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      document.documentElement.style.overflow = "";
      removeEventListener("keydown", onKey);
      menuBtn.current?.focus();
    };
  }, [open]);

  const go = (id: string) => (e: React.MouseEvent) => {
    if (!document.getElementById(id)) return; // not on the landing page: let the link navigate
    e.preventDefault();
    setOpen(false);
    setTimeout(() => scrollToId(id), 30); // after the menu's cleanup has re-enabled scrolling
  };

  const account = user ? { label: "Your account", to: "/app" } : { label: "Sign in", to: "/signin" };

  return (
    <header
      ref={bar}
      onFocus={() => show(true)}
      className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-md"
    >
      <Container className="flex h-16 items-center justify-between lg:h-20">
        <Link to="/" className="rounded-control text-h3" aria-label="Keel home">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-10 lg:flex">
          {anchors.map((a) => (
            <a key={a.id} href={`/#${a.id}`} onClick={go(a.id)} className="text-body text-ink-2 transition-colors duration-150 hover:text-ink">
              {a.label}
            </a>
          ))}
          <Link to={account.to} className="text-body text-ink-2 transition-colors duration-150 hover:text-ink">{account.label}</Link>
          <Button to="/signup">Apply</Button>
        </nav>

        <button
          ref={menuBtn}
          type="button"
          className="relative -mr-2 flex size-11 items-center justify-center rounded-control lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`absolute h-[1.5px] w-5 bg-ink transition-transform duration-400 ease-out-expo ${open ? "rotate-45" : "-translate-y-1"}`} />
          <span className={`absolute h-[1.5px] w-5 bg-ink transition-transform duration-400 ease-out-expo ${open ? "-rotate-45" : "translate-y-1"}`} />
        </button>
      </Container>

      {/* portalled: the header is transformed while hiding, which would trap a fixed child */}
      {open && createPortal(
        <div ref={sheet} id="mobile-menu" className="fixed inset-x-0 top-16 bottom-0 z-40 bg-canvas lg:hidden">
          <Container as="nav" className="flex h-full flex-col gap-2 pt-8 pb-10" aria-label="Main">
            {anchors.map((a) => (
              <a key={a.id} data-item href={`/#${a.id}`} onClick={go(a.id)} className="py-2 text-h2">{a.label}</a>
            ))}
            <Link data-item to={account.to} onClick={() => setOpen(false)} className="py-2 text-h2">{account.label}</Link>
            <div data-item className="mt-auto">
              <Button to="/signup" size="lg" className="w-full">Apply</Button>
            </div>
          </Container>
        </div>,
        document.body,
      )}
    </header>
  );
}
