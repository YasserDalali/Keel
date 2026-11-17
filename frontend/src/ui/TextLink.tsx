import type { ReactNode } from "react";
import { Link } from "react-router";

const cls =
  "bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size,color] duration-250 ease-out-expo hover:bg-[length:100%_1px] focus-visible:bg-[length:100%_1px]";

export function TextLink({ to, href, className = "", children }: { to?: string; href?: string; className?: string; children: ReactNode }) {
  return to ? (
    <Link to={to} className={`${cls} ${className}`}>{children}</Link>
  ) : (
    <a href={href} className={`${cls} ${className}`}>{children}</a>
  );
}
