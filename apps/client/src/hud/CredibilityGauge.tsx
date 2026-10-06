// Credibility: a printed circulation gauge with a scale. On a drop the lost part stays visible
// as a red "ghost" for a moment and then drains, so the hit reads even in a busy moment.
import { CREDIBILITY_LOW, CREDIBILITY_MAX } from '@redakcja/shared';
import { useEffect, useState } from 'react';
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';

/** How long the ghost bar holds the old value before draining. */
const GHOST_HOLD_MS = 600;

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, (value / CREDIBILITY_MAX) * 100))}%`;
}

export function CredibilityGauge() {
  const credibility = useGame((s) => s.credibility);
  const [ghost, setGhost] = useState(credibility);

  useEffect(() => {
    if (credibility >= ghost) {
      setGhost(credibility);
      return;
    }
    const handle = window.setTimeout(() => setGhost(credibility), GHOST_HOLD_MS);
    return () => window.clearTimeout(handle);
  }, [credibility, ghost]);

  const low = credibility <= CREDIBILITY_LOW;
  return (
    <div className={`${styles.gauge} ${low ? styles.low : ''}`} data-testid="hud-credibility">
      <div className={styles.gaugeHead}>
        <span className={styles.label}>{pl.hud.credibility}</span>
        {low && <span className={styles.lowTag}>{pl.hud.credibilityLow}</span>}
        <span className={styles.gaugeValue}>{credibility}</span>
      </div>
      <div className={styles.track}>
        <span className={styles.ghost} style={{ width: percent(ghost) }} />
        <span className={styles.fill} style={{ width: percent(credibility) }} />
        <span className={styles.scale} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
