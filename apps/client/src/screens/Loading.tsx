// Shown while the game scene downloads: a line of type being set.
import { pl } from '../strings/pl.ts';
import styles from './Loading.module.css';

export function Loading() {
  return (
    <div className={styles.loading} role="status">
      <p className={styles.text}>{pl.game.loading}</p>
    </div>
  );
}
