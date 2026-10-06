// Range input styled as a printed ruler with a pencil-mark thumb.
import { useId } from 'react';
import styles from './Slider.module.css';

export type SliderProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?(value: number): string;
  onChange(value: number): void;
};

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  format = (v) => `${Math.round(v * 100)}%`,
  onChange,
}: SliderProps) {
  const id = useId();
  return (
    <div className={styles.row}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id} className="tabular">
        {format(value)}
      </output>
    </div>
  );
}
