import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  loading?: boolean;
  to?: string;
  href?: string;
  children: ReactNode;
};

const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,transform] duration-150 ease-out-expo active:translate-y-px disabled:pointer-events-none disabled:opacity-60 aria-busy:opacity-100";
const variants = {
  primary: "bg-accent-600 text-canvas hover:bg-accent-700",
  secondary: "border border-line-strong text-ink hover:border-ink hover:bg-surface",
  ghost: "text-ink hover:text-accent-700 px-0!",
};
const sizes = { md: "h-11 px-5 text-body", lg: "h-14 px-7 text-body-lg" };

export function Button({ variant = "primary", size = "md", loading, to, href, className = "", children, ...rest }: Props) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  const inner = (
    <>
      <span className={loading ? "invisible" : "inline-flex items-center gap-2"}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-current animate-[dot_900ms_var(--ease-in-out-expo)_infinite]"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
      )}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return (
    <button className={cls} aria-busy={loading || undefined} disabled={loading || rest.disabled} {...rest}>
      {inner}
    </button>
  );
}
