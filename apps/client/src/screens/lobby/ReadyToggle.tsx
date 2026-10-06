// The sign-off box at the foot of the duty roster: a guest ticks it with a pen stroke to say
// they are ready. A native checkbox underneath keeps Space/Enter and screen readers working.
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
    <label className={`${styles.signoff} ${ready ? styles.signed : ''}`} htmlFor={id}>
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
      <span className={styles.text}>
        <span className={styles.word}>{pl.lobbyRoles.ready}</span>
        <span id={`${id}-hint`} className={styles.hint}>
          {pl.lobbyRoles.readyHint}
        </span>
      </span>
    </label>
  );
}
