// Gameplay HUD (design-rules §5): one compact pill top-left with the level timer, points and
// credibility; the folder queue top-centre; verdict toasts under it; the role ability chip
// bottom-left on keyboard and gamepad (S7-40); the results panel at the end of a level. Room
// code and ping live in the in-game menu sheet (GameMenu, S7-10). On phones the pill is one row
// (S7-11); the pill and the queue mark the measured HUD band (hud-band.ts). In versus the rival
// chip hangs under the pill, or ends its row on phones (S7-89).
import { ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { useEffect } from 'react';
import { AbilityChip } from '../abilities/AbilityChip.tsx';
import { EventBanners } from '../events/EventBanners.tsx';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { CredibilityGauge } from './CredibilityGauge.tsx';
import { installHudDevFixture } from './dev-fixture.ts';
import { FolderQueue } from './FolderQueue.tsx';
import styles from './Hud.module.css';
import { LevelTimer } from './LevelTimer.tsx';
import { ResultsPlate } from './ResultsPlate.tsx';
import { ScoreCounter } from './ScoreCounter.tsx';
import { VerdictToasts } from './VerdictToasts.tsx';
import { VersusChip } from './VersusChip.tsx';

export function Hud() {
  const levelEnd = useGame((s) => s.levelEnd);
  // The tempo chip's wider phone pill; an endless versus match shows the rival chip instead.
  const endless = useApp((s) => s.room?.levelId === ENDLESS_LEVEL_ID && s.room.mode !== 'versus');

  useEffect(() => installHudDevFixture(), []);

  return (
    <div className={`${styles.hud} ${endless ? styles.endless : ''}`}>
      <div className={styles.pill} data-testid="hud" data-hud-band data-hud-pill>
        <LevelTimer />
        <div className={styles.stats}>
          <ScoreCounter />
          <CredibilityGauge />
        </div>
        <VersusChip />
      </div>
      <FolderQueue />
      <VerdictToasts />
      <EventBanners />
      <AbilityChip />
      {levelEnd && <ResultsPlate levelEnd={levelEnd} />}
    </div>
  );
}
