// Score: a mechanical counter that rolls up (or down) to the server's value.
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';
import { formatScore } from './hud-model.ts';
import { useRolledNumber } from './use-rolled-number.ts';

export function ScoreCounter() {
  const score = useGame((s) => s.score);
  const shown = useRolledNumber(score);
  return (
    <div className={styles.score} data-testid="hud-score">
      <span className={styles.label}>{pl.hud.score}</span>
      <span className={styles.counter}>{formatScore(shown)}</span>
    </div>
  );
}
