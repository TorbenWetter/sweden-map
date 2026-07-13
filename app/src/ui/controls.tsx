import type { ReactNode } from 'react';
import { useStudio } from '../state/store';

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const begin = useStudio((s) => s.beginTransient);
  const end = useStudio((s) => s.endTransient);
  return (
    <Field label={label}>
      <span className="color-field">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onFocus={begin}
          onBlur={end}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="mono-input hex-input"
          type="text"
          value={value}
          spellCheck={false}
          onFocus={begin}
          onBlur={end}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </Field>
  );
}

export function RangeField({
  label, value, min, max, step, display, onChange, log, snap,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  display?: (v: number) => string;
  /** quantize to a ladder of round values, so two sliders reading the same land on the same number */
  snap?: (v: number) => number;
  onChange: (v: number) => void;
}) {
  const begin = useStudio((s) => s.beginTransient);
  const end = useStudio((s) => s.endTransient);
  const toSlider = (v: number) => (log ? Math.log(Math.max(v, min)) : v);
  const fromSlider = (v: number) => {
    const raw = log ? Math.exp(v) : v;
    return snap ? snap(raw) : raw;
  };
  return (
    <Field label={label} wide>
      <input
        type="range"
        min={toSlider(min)}
        max={toSlider(max)}
        step={log ? (Math.log(max) - Math.log(min)) / 200 : step ?? 1}
        value={toSlider(value)}
        onPointerDown={begin}
        onPointerUp={end}
        onKeyDown={begin}
        onKeyUp={end}
        onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
      />
      <span className="range-value">{display ? display(value) : value}</span>
    </Field>
  );
}

export function NumberField({
  label, value, step = 1, min, max, unit, onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const begin = useStudio((s) => s.beginTransient);
  const end = useStudio((s) => s.endTransient);
  return (
    <Field label={label}>
      <span className="number-field">
        <input
          className="mono-input"
          type="number"
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          step={step}
          min={min}
          max={max}
          onFocus={begin}
          onBlur={end}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {unit ? <span className="unit">{unit}</span> : null}
      </span>
    </Field>
  );
}

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SelectField<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
