// Shown while the match assets arrive: the logo, a chunky progress bar that reflects measured
// downloads (loading/progress.ts) and the three bouncing dots on the sky.
import { overallFraction, useLoading } from '../loading/progress.ts';
import { pl } from '../strings/pl.ts';
import { GameLogo } from './GameLogo.tsx';
import styles from './Loading.module.css';

export function Loading() {
  const fraction = useLoading((s) => overallFraction(s.tasks));
  const percent = Math.round(fraction * 100);
  return (
    <div className={styles.loading} data-testid="loading">
      <GameLogo small as="div" />
      <div className={styles.stack}>
        <p className={`panel ${styles.pill}`} role="status">
          <span className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {pl.game.loading}
        </p>
        <div
          className={styles.track}
          role="progressbar"
          aria-label={pl.game.loading}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.fill} style={{ transform: `scaleX(${fraction})` }} />
        </div>
      </div>
    </div>
  );
}
