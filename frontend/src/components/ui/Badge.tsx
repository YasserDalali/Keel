type Tone = "neutral" | "success" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "border-ink text-ink",
  success: "border-ink text-ink bg-paper-2",
  danger: "border-hazard text-hazard",
};

export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: string;
}) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide2 ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
