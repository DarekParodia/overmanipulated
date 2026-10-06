// The guest's main action: a big chunky "Gotowy" toggle. Yellow while it still needs pressing,
// green with a ✓ once ready. A native checkbox underneath keeps Space/Enter, gamepad focus and
// screen readers working.
import { useId } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import styles from './ReadyToggle.module.css';

export type ReadyToggleProps = {
  ready: boolean;
  onChange(ready: boolean): void;
  disabled?: boolean;
};

export function ReadyToggle({ ready, onChange, disabled = false }: ReadyToggleProps) {
  const id = useId();
  return (
    <>
      <label
        className={`${styles.toggle} ${ready ? styles.ready : ''} ${disabled ? styles.disabled : ''}`}
        htmlFor={id}
      >
        <input
          id={id}
          type="checkbox"
          className={styles.native}
          checked={ready}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            emitCue(event.target.checked ? 'lobby.ready' : 'ui.back');
            onChange(event.target.checked);
          }}
        />
        <span className={styles.box} aria-hidden="true">
          <svg viewBox="0 0 24 24" className={styles.tick} aria-hidden="true">
            <path d="M4.5 12.8 L9.8 18.1 L19.8 5.6" />
          </svg>
        </span>
        <span className={styles.word}>{ready ? pl.lobbyRoles.readyDone : pl.lobbyRoles.ready}</span>
      </label>
      <span id={`${id}-hint`} className="visually-hidden">
        {pl.lobbyRoles.readyHint}
      </span>
    </>
  );
}
