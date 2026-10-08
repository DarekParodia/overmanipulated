// Points: a star and a number that rolls up (or down) to the server's value. A verdict's
// `scorePop` bumps the number and floats a "+N" / "−N" chip (green / red, the sign as shape) off
// it; with reduced motion the chip just appears and fades, the number does not bump.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';
import { HudGlyph } from './HudGlyph.tsx';
import { formatDelta, formatScore } from './hud-model.ts';
import { playMotion, useHudTrigger } from './hud-motion.ts';
import { useRolledNumber } from './use-rolled-number.ts';

/** How long a floating "+N" stays (matches the score-float keyframes in Hud.module.css). */
const POP_MS = 1100;
/** At most this many chips float at once; older ones are dropped. */
const POP_MAX = 3;

type Pop = { id: number; value: number };

export function ScoreCounter() {
  const score = useGame((s) => s.score);
  const shown = useRolledNumber(score);
  const counter = useRef<HTMLSpanElement>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const serial = useRef(0);
  const timers = useRef(new Set<number>());

  useHudTrigger(['scorePop'], (_trigger, context, options) => {
    const value = context.value ?? 0;
    if (value === 0) {
      return;
    }
    playMotion(counter.current, 'bump', options);
    const id = serial.current++;
    setPops((current) => [...current.slice(1 - POP_MAX), { id, value }]);
    const handle = window.setTimeout(() => {
      timers.current.delete(handle);
      setPops((current) => current.filter((p) => p.id !== id));
    }, POP_MS);
    timers.current.add(handle);
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const handle of pending) {
        window.clearTimeout(handle);
      }
      pending.clear();
    };
  }, []);

  return (
    <div className={styles.score} data-testid="hud-score">
      <HudGlyph name="star" size={26} fill="var(--yellow)" label={pl.hud.score} />
      <span ref={counter} className={styles.counter}>
        {formatScore(shown)}
      </span>
      {pops.map((pop) => (
        <span
          key={pop.id}
          className={`${styles.scorePop} ${pop.value > 0 ? styles.scoreGain : styles.scoreLoss}`}
          aria-hidden
        >
          {formatDelta(pop.value)}
        </span>
      ))}
    </div>
  );
}
