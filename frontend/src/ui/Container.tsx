import type { ElementType, ReactNode } from "react";

export function Container({ as: Tag = "div", className = "", children, ...rest }: { as?: ElementType; className?: string; children: ReactNode; id?: string }) {
  return <Tag className={`mx-auto w-full max-w-[1320px] px-6 lg:px-10 ${className}`} {...rest}>{children}</Tag>;
}
