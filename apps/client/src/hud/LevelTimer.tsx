// Level timer: a big clock in the HUD pill. In the last 30 s it turns red and wobbles gently
// (no wobble with reduced motion; the colour and the clock icon stay, nothing blinks). The
// moment the last seconds start (`timerPulse`) the clock beats three times; steady under
// reduced motion and no-flash.
import { ENDLESS_LEVEL_ID, LEVEL_LAST_SECONDS_MS } from '@redakcja/shared';
import { useEffect, useRef } from 'react';
import { formatElapsed, tempoLevel } from '../endless/endless-model.ts';
import { emitCue } from '../fx/feedback.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Hud.module.css';
import { formatClock } from './hud-model.ts';
import { playMotion, useHudTrigger } from './hud-motion.ts';
import { useLevelClock } from './use-level-clock.ts';

/**
 * Endless mode counts up and never runs out: no red last seconds. The „Tempo ×N” chip hangs
 * under the pill and pops each time N grows.
 */
function TempoChip({ elapsedMs }: { elapsedMs: number }) {
  const chip = useRef<HTMLSpanElement>(null);
  const tempo = tempoLevel(elapsedMs);
  const shown = useRef(tempo);
  useEffect(() => {
    if (tempo > shown.current) {
      emitCue('endless.tempo');
    }
    shown.current = tempo;
  }, [tempo]);
  useHudTrigger(['tempoUp'], (_trigger, _context, options) => {
    playMotion(chip.current, 'bump', options);
  });
  return (
    <span
      ref={chip}
      className={styles.tempo}
      data-testid="hud-tempo"
      role="status"
      aria-label={pl.endless.tempoLabel(tempo)}
    >
      <Icon name="play" size={20} />
      {pl.endless.tempo(tempo)}
    </span>
  );
}

export function LevelTimer() {
  const { timeLeftMs, elapsedMs } = useLevelClock();
  const endless = useApp((s) => s.room?.levelId === ENDLESS_LEVEL_ID);
  const timer = useRef<HTMLDivElement>(null);
  const last = !endless && timeLeftMs > 0 && timeLeftMs <= LEVEL_LAST_SECONDS_MS;
  const clock = endless ? formatElapsed(elapsedMs) : formatClock(timeLeftMs);

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
      <span
        className={styles.clock}
        role="timer"
        aria-label={`${endless ? pl.endless.timer : pl.hud.timer}: ${clock}`}
      >
        {clock}
      </span>
      {endless && <TempoChip elapsedMs={elapsedMs} />}
    </div>
  );
}
