import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "../lib/motion";

type Tone = "success" | "info" | "danger";
export type ToastInput = { title: string; body?: string; tone?: Tone; celebrate?: boolean };
type Item = ToastInput & { id: number };

const Ctx = createContext<((t: ToastInput) => void) | null>(null);

/** `toast({ title, body?, tone?, celebrate? })`. Outside a provider it does nothing (and warns), so a missing provider never crashes a page. */
export function useToast() {
  const fn = useContext(Ctx);
  return fn ?? ((t: ToastInput) => console.warn("[toast] no ToastProvider:", t.title));
}

const DOT: Record<Tone, string> = { success: "bg-accent-600", info: "bg-ink-3", danger: "bg-danger" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [burst, setBurst] = useState(0);
  const reduced = useReducedMotion();
  const seq = useRef(0);

  const toast = useCallback(
    (t: ToastInput) => {
      setItems((list) => [...list.slice(-3), { ...t, id: ++seq.current }]); // keep at most 4 on screen
      if (t.celebrate && !reduced) setBurst((b) => b + 1);
    },
    [reduced],
  );
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] print:hidden"
      >
        {items.map((t) => <Toast key={t.id} item={t} onClose={() => dismiss(t.id)} />)}
      </div>
      {burst > 0 && <Confetti key={burst} />}
    </Ctx.Provider>
  );
}

const LIFE = 6000;

function Toast({ item, onClose }: { item: Item; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(LIFE);
  const started = useRef(0);

  // Auto-dismiss after 6 s of visible time; hovering or focusing the toast pauses the clock.
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const t = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(t);
      left.current -= Date.now() - started.current;
    };
  }, [paused, onClose]);

  const tone = item.tone ?? "info";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-art bg-surface p-4 shadow-float-2 animate-[rise_400ms_var(--ease-out-expo)]"
    >
      <span aria-hidden className={`mt-[7px] size-2 rounded-full ${DOT[tone]}`} />
      <div className="flex flex-col gap-0.5">
        <p className="text-body font-medium">{item.title}</p>
        {item.body && <p className="text-small text-ink-2">{item.body}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="-mt-1 -mr-1 flex size-9 items-center justify-center rounded-control text-ink-2 hover:text-ink">
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

// Keel accent, mint, mustard, lilac (mirrors tokens.css; canvas can't read CSS variables cheaply).
const COLORS = ["#1f7a4d", "#7fd1ae", "#c9a43a", "#b59bd9", "#44a273"];
const DURATION = 1600;

/** One full-screen canvas burst from the bottom centre: ~120 paper bits, gravity + drag, gone after 1.6 s. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setDone(true);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (canvas.width = innerWidth * dpr);
    const h = (canvas.height = innerHeight * dpr);
    const parts = Array.from({ length: 120 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
      const speed = (9 + Math.random() * 9) * dpr;
      return {
        x: w / 2 + (Math.random() - 0.5) * w * 0.25,
        y: h + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 1.6,
        size: (5 + Math.random() * 6) * dpr,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.65) / (DURATION * 0.35));
      for (const p of parts) {
        p.vy += 0.42 * dpr; // gravity
        p.vx *= 0.985; // drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (done) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[80] size-full" />;
}
