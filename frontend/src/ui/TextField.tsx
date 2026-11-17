import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: ReactNode };

export function TextField({ label, hint, error, className = "", ...input }: Props) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-label text-ink-2">{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`h-12 rounded-control border bg-surface px-4 text-body text-ink outline-offset-0 transition-colors duration-150 hover:border-line-strong aria-invalid:border-danger ${
          error ? "border-danger" : "border-line"
        }`}
        {...input}
      />
      {note && (
        <p id={noteId} className={`text-small ${error ? "text-danger" : "text-ink-2"}`}>{note}</p>
      )}
    </div>
  );
}
