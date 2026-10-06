// Shown while the game scene downloads: the logo and three bouncing dots on the sky.
import { pl } from '../strings/pl.ts';
import { GameLogo } from './GameLogo.tsx';
import styles from './Loading.module.css';

export function Loading() {
  return (
    <div className={styles.loading} role="status">
      <GameLogo small as="div" />
      <p className={`panel ${styles.pill}`}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {pl.game.loading}
      </p>
    </div>
  );
}
