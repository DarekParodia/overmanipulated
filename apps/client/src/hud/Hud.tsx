// Gameplay HUD (S2-09). A paper plate in the top-left corner (level timer, score, credibility
// gauge, room code and connection), the folder queue pinned along the top, verdict slips under
// it and the level-end front page. HUD text over the 3D scene always sits on paper.
import { useEffect } from 'react';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { CredibilityGauge } from './CredibilityGauge.tsx';
import { installHudDevFixture } from './dev-fixture.ts';
import { FolderQueue } from './FolderQueue.tsx';
import styles from './Hud.module.css';
import { LevelTimer } from './LevelTimer.tsx';
import { ResultsPlate } from './ResultsPlate.tsx';
import { ScoreCounter } from './ScoreCounter.tsx';
import { VerdictToasts } from './VerdictToasts.tsx';

export function Hud() {
  const roomCode = useApp((s) => s.room?.roomCode);
  const connection = useApp((s) => s.connection);
  const rtt = useApp((s) => s.rttMs);
  const levelEnd = useGame((s) => s.levelEnd);

  useEffect(() => installHudDevFixture(), []);

  return (
    <div className={styles.hud}>
      <div className={styles.plate} data-testid="hud">
        <LevelTimer />
        <ScoreCounter />
        <CredibilityGauge />
        <p className={styles.room}>
          <span className={styles.label}>{pl.game.room}</span>
          <span className={styles.code}>{roomCode}</span>
          <span className={`${styles.status} ${styles[connection]}`} aria-live="polite">
            {connection === 'online' && rtt !== null
              ? pl.game.ping(rtt)
              : pl.connection[connection === 'idle' ? 'offline' : connection]}
          </span>
        </p>
      </div>
      <FolderQueue />
      <VerdictToasts />
      {levelEnd && <ResultsPlate levelEnd={levelEnd} />}
    </div>
  );
}
