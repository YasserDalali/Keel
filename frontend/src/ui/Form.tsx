import { useRef, useState, type FormEvent, type FormHTMLAttributes } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Problem = { el: Field; label: string; message: string };

const labelOf = (el: Field) => (el.labels?.[0]?.textContent ?? el.name).trim();

/** Plain-language fix for whatever the browser's constraint check found. */
export function messageFor(el: Field): string {
  const v = el.validity;
  const label = labelOf(el).toLowerCase();
  if (v.valueMissing) return el instanceof HTMLInputElement && el.type === "checkbox" ? "Tick this box to continue." : `Enter your ${label}.`;
  if (v.typeMismatch && el.type === "email") return "Use an email like name@example.com.";
  if (v.tooShort && el instanceof HTMLInputElement) return `Use at least ${el.minLength} characters (you have ${el.value.length}).`;
  if (v.patternMismatch) return el.title || "Check the format.";
  return el.validationMessage;
}

/**
 * A <form> whose validation shows as a centred modal listing every problem, instead of the browser's bubble.
 * Uses the native constraints (required, type, minLength, pattern), so rules stay on the inputs.
 */
export function Form({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const batch = useRef<Problem[]>([]);

  // The browser fires `invalid` on each bad field synchronously during submit; collect them, then open once.
  function onInvalidCapture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.target as Field;
    el.setAttribute("aria-invalid", "true");
    batch.current.push({ el, label: labelOf(el), message: messageFor(el) });
    if (batch.current.length === 1)
      queueMicrotask(() => {
        setProblems(batch.current);
        batch.current = [];
      });
  }

  function onInput(e: FormEvent<HTMLFormElement>) {
    const el = e.target as Field;
    if (el.getAttribute("aria-invalid") === "true" && el.validity.valid) el.removeAttribute("aria-invalid");
  }

  function fix(el?: Field) {
    setProblems([]);
    if (el) setTimeout(() => el.focus(), 0); // after the dialog returns focus to its opener
  }

  const n = problems.length;
  return (
    <>
      <form {...props} onInvalidCapture={onInvalidCapture} onInput={onInput}>
        {children}
      </form>
      <Dialog open={n > 0} onClose={() => fix(problems[0]?.el)} title={n === 1 ? "One thing to fix" : `${n} things to fix`}>
        <p className="text-body text-ink-2">Nothing was sent yet. Fix {n === 1 ? "this" : "these"} and try again.</p>
        <ol className="flex flex-col">
          {problems.map((p, i) => (
            <li key={i} className="border-t border-line last:border-b">
              <button
                type="button"
                onClick={() => fix(p.el)}
                className="group grid w-full grid-cols-[1.75rem_1fr_auto] items-start gap-3 py-3 text-left transition-colors duration-150 hover:bg-canvas"
              >
                <span aria-hidden className="mt-[7px] size-2 rounded-full bg-danger" />
                <span className="flex flex-col">
                  <span className="text-body font-medium">{p.label}</span>
                  <span className="text-small text-ink-2">{p.message}</span>
                </span>
                <span className="self-center text-small font-medium text-accent-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">Fix</span>
              </button>
            </li>
          ))}
        </ol>
        <Button onClick={() => fix(problems[0]?.el)} className="self-end">Fix {problems[0]?.label.toLowerCase()}</Button>
      </Dialog>
    </>
  );
}
