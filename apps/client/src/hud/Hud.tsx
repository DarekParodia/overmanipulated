// Gameplay HUD (design-rules §5): one compact pill top-left with the level timer, points and
// credibility; the folder queue top-centre; verdict toasts under it; the results panel at the
// end of a level. Room code and ping live in a small chip under the screen tools (RoomChip).
import { useEffect } from 'react';
import { EventBanners } from '../events/EventBanners.tsx';
import { useGame } from '../net/game-store.ts';
import { CredibilityGauge } from './CredibilityGauge.tsx';
import { installHudDevFixture } from './dev-fixture.ts';
import { FolderQueue } from './FolderQueue.tsx';
import styles from './Hud.module.css';
import { LevelTimer } from './LevelTimer.tsx';
import { ResultsPlate } from './ResultsPlate.tsx';
import { ScoreCounter } from './ScoreCounter.tsx';
import { VerdictToasts } from './VerdictToasts.tsx';

export function Hud() {
  const levelEnd = useGame((s) => s.levelEnd);

  useEffect(() => installHudDevFixture(), []);

  return (
    <div className={styles.hud}>
      <div className={styles.pill} data-testid="hud">
        <LevelTimer />
        <div className={styles.stats}>
          <ScoreCounter />
          <CredibilityGauge />
        </div>
      </div>
      <FolderQueue />
      <VerdictToasts />
      <EventBanners />
      {levelEnd && <ResultsPlate levelEnd={levelEnd} />}
    </div>
  );
}
