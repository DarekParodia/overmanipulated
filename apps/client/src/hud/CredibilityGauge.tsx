// Credibility: a shield and a chunky bar with the number. Green while it's fine; when it gets
// low the bar turns red and the shield cracks (shape, not only colour). On a drop the lost part
// stays visible as a red "ghost" for a moment and then drains, so the hit reads at a glance.
// A big hit (`credibilityCrack`: a published fake, a rejected truth) cracks the shield for a
// moment even when credibility is still fine, and shakes the gauge (no shake with reduced motion).
import { CREDIBILITY_LOW, CREDIBILITY_MAX } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';
import { HudGlyph } from './HudGlyph.tsx';
import { playMotion, useHudTrigger } from './hud-motion.ts';

/** How long the ghost bar holds the old value before draining. */
const GHOST_HOLD_MS = 600;
/** How long the shield stays cracked after a big hit. */
const CRACK_MS = 1200;

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, (value / CREDIBILITY_MAX) * 100))}%`;
}

export function CredibilityGauge() {
  const credibility = useGame((s) => s.credibility);
  const [ghost, setGhost] = useState(credibility);
  const [cracked, setCracked] = useState(false);
  const gauge = useRef<HTMLDivElement>(null);
  const crackTimer = useRef(0);

  useEffect(() => {
    if (credibility >= ghost) {
      setGhost(credibility);
      return;
    }
    const handle = window.setTimeout(() => setGhost(credibility), GHOST_HOLD_MS);
    return () => window.clearTimeout(handle);
  }, [credibility, ghost]);

  useHudTrigger(['credibilityCrack'], (_trigger, _context, options) => {
    playMotion(gauge.current, 'shake', options);
    setCracked(true);
    window.clearTimeout(crackTimer.current);
    crackTimer.current = window.setTimeout(() => setCracked(false), CRACK_MS);
  });
  useEffect(() => () => window.clearTimeout(crackTimer.current), []);

  const low = credibility <= CREDIBILITY_LOW;
  const broken = low || cracked;
  return (
    <div
      ref={gauge}
      className={`${styles.gauge} ${low ? styles.low : ''} ${cracked ? styles.cracked : ''}`}
      data-testid="hud-credibility"
      data-cracked={cracked || undefined}
    >
      <HudGlyph
        name={broken ? 'shieldCracked' : 'shield'}
        size={26}
        fill={broken ? 'var(--red)' : 'var(--green)'}
        label={low ? pl.hud.credibilityLow : pl.hud.credibility}
        className={styles.shield}
      />
      <span className={styles.gaugeValue}>{credibility}</span>
      <span className={styles.track} aria-hidden>
        <span className={styles.ghost} style={{ width: percent(ghost) }} />
        <span className={styles.fill} style={{ width: percent(credibility) }} />
      </span>
    </div>
  );
}
