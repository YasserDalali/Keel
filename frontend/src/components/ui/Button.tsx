import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "hazard";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-ink text-paper border border-ink hover:bg-paper hover:text-ink",
  secondary: "bg-paper text-ink border border-ink hover:bg-ink hover:text-paper",
  hazard: "bg-hazard text-paper border border-hazard hover:bg-paper hover:text-hazard",
};

export default function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`font-mono text-xs font-semibold uppercase tracking-wide2 px-4 py-2 transition-colors disabled:opacity-40 disabled:pointer-events-none ${variantClass[variant]} ${className}`}
    />
  );
}
