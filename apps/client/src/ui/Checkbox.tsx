// Checkbox drawn as a box ticked with a pen stroke, like a printed form.
import { useId } from 'react';
import { emitCue } from '../fx/feedback.ts';
import styles from './Checkbox.module.css';

export type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
};

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const id = useId();
  return (
    <label className={styles.row} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className={styles.native}
        checked={checked}
        onChange={(event) => {
          emitCue('ui.click');
          onChange(event.target.checked);
        }}
      />
      <span className={styles.box} aria-hidden="true">
        <svg viewBox="0 0 24 24" className={styles.tick} aria-hidden="true">
          <path d="M4.5 12.8 L9.8 18.1 L19.8 5.6" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}
