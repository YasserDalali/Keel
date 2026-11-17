import { useId } from "react";

type Props = { label: string; value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (v: number) => void };

export function Slider({ label, value, min, max, step, format, onChange }: Props) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-body text-ink-2">{label}</label>
        <output htmlFor={id} className="tabular text-h3">{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="tabular flex justify-between text-small text-ink-2">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
