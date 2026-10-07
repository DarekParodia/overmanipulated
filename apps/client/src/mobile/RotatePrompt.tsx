// Shown over gameplay on touch devices held in portrait (gameplay needs landscape): a chunky
// phone that tips over, the instruction, and one short reason.
import { pl } from '../strings/pl.ts';
import styles from './RotatePrompt.module.css';

export function RotatePrompt() {
  return (
    <div className={styles.prompt} role="alert">
      <div className={`panel ${styles.card}`}>
        <svg viewBox="0 0 64 64" className={styles.phone} aria-hidden="true">
          <rect x="20" y="6" width="24" height="44" rx="5" className={styles.body} />
          <rect x="24" y="11" width="16" height="30" rx="2" className={styles.screen} />
          <path d="M29 45.5 L35 45.5" />
          <path d="M10 56 C 5 47, 6 36, 11 30 M11 30 L5.5 32 M11 30 L12.5 36" />
        </svg>
        <p className={styles.title}>{pl.game.rotate}</p>
        <p className={styles.hint}>{pl.game.rotateHint}</p>
      </div>
    </div>
  );
}
