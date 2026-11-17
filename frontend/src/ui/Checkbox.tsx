import type { InputHTMLAttributes, ReactNode } from "react";

export function Checkbox({ children, className = "", ...input }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return (
    <label className={`group flex cursor-pointer items-start gap-3 text-body text-ink ${className}`}>
      <span className="relative mt-[3px] flex size-5 shrink-0">
        <input
          type="checkbox"
          className="peer size-5 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors duration-150 checked:border-accent-600 checked:bg-accent-600 group-hover:border-ink"
          {...input}
        />
        <svg viewBox="0 0 20 20" aria-hidden className="pointer-events-none absolute inset-0 size-5 scale-50 text-canvas opacity-0 transition-[opacity,transform] duration-250 ease-out-expo peer-checked:scale-100 peer-checked:opacity-100">
          <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}
