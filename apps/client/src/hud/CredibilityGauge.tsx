// Credibility: a shield and a chunky bar with the number. Green while it's fine; when it gets
// low the bar turns red and the shield cracks (shape, not only colour). On a drop the lost part
// stays visible as a red "ghost" for a moment and then drains, so the hit reads at a glance.
import { CREDIBILITY_LOW, CREDIBILITY_MAX } from '@redakcja/shared';
import { useEffect, useState } from 'react';
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';
import { HudGlyph } from './HudGlyph.tsx';

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
      <HudGlyph
        name={low ? 'shieldCracked' : 'shield'}
        size={26}
        fill={low ? 'var(--red)' : 'var(--green)'}
        label={low ? pl.hud.credibilityLow : pl.hud.credibility}
        className={styles.shield}
      />
      <span className={styles.track} aria-hidden>
        <span className={styles.ghost} style={{ width: percent(ghost) }} />
        <span className={styles.fill} style={{ width: percent(credibility) }} />
      </span>
      <span className={styles.gaugeValue}>{credibility}</span>
    </div>
  );
}
