import type { ReactNode } from "react";

interface Props {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function Panel({ title, children, className = "" }: Props) {
  return (
    <div className={`border border-ink bg-paper ${className}`}>
      {title && (
        <div className="border-b border-ink px-4 py-2">
          <span className="font-mono text-[11px] uppercase tracking-wide2 text-ink">
            [ {title} ]
          </span>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
