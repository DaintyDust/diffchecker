import type { ReactNode } from "react";

type ToggleProps = { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string };

export function Toggle({ label, checked, onChange, hint }: ToggleProps) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

type SegmentedProps<T extends string> = { value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; label: string };

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className={option.value === value ? "active" : undefined} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
