// Level timer: a big clock in the HUD pill. In the last 30 s it turns red and wobbles gently
// (no wobble with reduced motion; the colour and the clock icon stay, nothing blinks).
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
      <Icon name="clock" size={28} className={styles.timerIcon ?? ''} />
      <span className={styles.clock} role="timer" aria-label={`${pl.hud.timer}: ${clock}`}>
        {clock}
      </span>
    </div>
  );
}
