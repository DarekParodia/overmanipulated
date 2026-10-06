// Level timer: the newsroom wall clock reduced to a printed "closing in" box. The last 30 s
// are emphasised (bigger, red, a ticking nudge each second unless reduced motion).
import { LEVEL_LAST_SECONDS_MS } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Hud.module.css';
import { formatClock } from './hud-model.ts';
import { useLevelClock } from './use-level-clock.ts';

export function LevelTimer() {
  const { timeLeftMs } = useLevelClock();
  const last = timeLeftMs > 0 && timeLeftMs <= LEVEL_LAST_SECONDS_MS;
  const clock = formatClock(timeLeftMs);
  return (
    <div className={`${styles.timer} ${last ? styles.lastSeconds : ''}`} data-testid="hud-timer">
      <Icon name="clock" size={18} />
      <span className={styles.label}>{pl.hud.timer}</span>
      {/* Keyed by the shown second so the tick nudge replays once per second. */}
      <span key={last ? clock : 'calm'} className={styles.clock} role="timer">
        {clock}
      </span>
    </div>
  );
}
