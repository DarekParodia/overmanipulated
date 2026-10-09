// Level timer: a big clock in the HUD pill. In the last 30 s it turns red and wobbles gently
// (no wobble with reduced motion; the colour and the clock icon stay, nothing blinks). The
// moment the last seconds start (`timerPulse`) the clock beats three times; steady under
// reduced motion and no-flash.
import { LEVEL_LAST_SECONDS_MS } from '@redakcja/shared';
import { useRef } from 'react';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Hud.module.css';
import { formatClock } from './hud-model.ts';
import { playMotion, useHudTrigger } from './hud-motion.ts';
import { useLevelClock } from './use-level-clock.ts';

export function LevelTimer() {
  const { timeLeftMs } = useLevelClock();
  const timer = useRef<HTMLDivElement>(null);
  const last = timeLeftMs > 0 && timeLeftMs <= LEVEL_LAST_SECONDS_MS;
  const clock = formatClock(timeLeftMs);

  useHudTrigger(['timerPulse'], (_trigger, _context, options) => {
    playMotion(timer.current, 'pulse', options);
  });

  return (
    <div
      ref={timer}
      className={`${styles.timer} ${last ? styles.lastSeconds : ''}`}
      data-testid="hud-timer"
    >
      <Icon name="clock" size={28} className={styles.timerIcon ?? ''} />
      <span className={styles.clock} role="timer" aria-label={`${pl.hud.timer}: ${clock}`}>
        {clock}
      </span>
    </div>
  );
}
