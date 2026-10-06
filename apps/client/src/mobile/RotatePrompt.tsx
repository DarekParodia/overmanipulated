// Shown over gameplay on touch devices held in portrait (gameplay needs landscape).
import { pl } from '../strings/pl.ts';
import styles from './RotatePrompt.module.css';

export function RotatePrompt() {
  return (
    <div className={styles.prompt} role="alert">
      <svg viewBox="0 0 64 64" className={styles.phone} aria-hidden="true">
        <rect x="20" y="8" width="24" height="44" rx="3" />
        <path d="M14 54 C 8 46, 8 34, 12 28 M12 28 L8 31 M12 28 L15 32" />
      </svg>
      <p className={styles.title}>{pl.game.rotate}</p>
      <p>{pl.game.rotateHint}</p>
    </div>
  );
}
