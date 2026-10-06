// Form field on paper: typed label above a ruled writing line (design-rules §1, settings form).
import { type InputHTMLAttributes, useId } from 'react';
import styles from './Field.module.css';

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> & {
  label: string;
  hint?: string;
  error?: string | null;
  large?: boolean;
};

export function Field({ label, hint, error, large = false, ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        {...input}
        id={id}
        className={`${styles.input} ${large ? styles.large : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? hintId : undefined}
      />
      {(error || hint) && (
        <p id={hintId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
