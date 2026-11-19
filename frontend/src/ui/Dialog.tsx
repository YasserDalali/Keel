import { useEffect, useRef, type ReactNode } from "react";
import { getLenis } from "../lib/motion";

/** Native modal <dialog>: focus trap, Escape and backdrop come from the browser. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      getLenis()?.stop();
    }
    if (!open && d.open) d.close();
    return () => getLenis()?.start();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] overflow-y-auto rounded-art bg-surface p-0 text-ink shadow-float-2 backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-[rise_400ms_var(--ease-out-expo)]"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8" data-lenis-prevent>
        <div className="flex items-start justify-between gap-6">
          <h2 className="text-h3">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mt-2 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:text-ink">
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
