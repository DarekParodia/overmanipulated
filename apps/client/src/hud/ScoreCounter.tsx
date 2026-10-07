// Points: a star and a number that rolls up (or down) to the server's value.
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';
import { HudGlyph } from './HudGlyph.tsx';
import { formatScore } from './hud-model.ts';
import { useRolledNumber } from './use-rolled-number.ts';

export function ScoreCounter() {
  const score = useGame((s) => s.score);
  const shown = useRolledNumber(score);
  return (
    <div className={styles.score} data-testid="hud-score">
      <HudGlyph name="star" size={26} fill="var(--yellow)" label={pl.hud.score} />
      <span className={styles.counter}>{formatScore(shown)}</span>
    </div>
  );
}
