// Screen-space touches as flat DOM layers above the 3D canvas and below the HUD (no post-
// processing, no blur, no gradients):
// - a red frame that thickens as credibility falls under 30 %;
// - blue/red glitch bars on the screen edges while a bot raid is on;
// - a pulsing red bar on the top and bottom edge when any folder is under 10 s from its deadline.
// Reduced motion or no-flash: all of them stand still (the information stays, nothing moves).
// The glitch bars also stand still on the low quality preset.
import { type CSSProperties, memo } from 'react';
import { useLevelClock } from '../../hud/use-level-clock.ts';
import { useGame } from '../../net/game-store.ts';
import { useQuality } from '../../scene/quality.ts';
import { useSettings } from '../../store/settings.ts';
import styles from './ScreenFx.module.css';
import {
  effectsAnimated,
  glitchAnimated,
  isRaidActive,
  pressureTier,
  vignetteLevel,
} from './screen-fx-model.ts';

/** Bar layout per edge: top %, length in vmin, thickness in vmin, colour, jump distance in vmin. */
const GLITCH_BARS = [
  { top: 9, length: 3.2, thick: 1.1, blue: true, jump: 2.4 },
  { top: 21, length: 5, thick: 0.6, blue: false, jump: -3 },
  { top: 33, length: 2.4, thick: 1.4, blue: false, jump: 2 },
  { top: 47, length: 4.2, thick: 0.7, blue: true, jump: -2.6 },
  { top: 58, length: 3, thick: 1.2, blue: true, jump: 3 },
  { top: 71, length: 5.2, thick: 0.6, blue: false, jump: -2.2 },
  { top: 84, length: 2.8, thick: 1.3, blue: true, jump: 2.6 },
] as const;

const GlitchEdge = memo(function GlitchEdge({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`${styles.edge} ${side === 'left' ? styles.left : styles.right}`}>
      {GLITCH_BARS.map((bar, index) => (
        <i
          key={bar.top}
          className={`${styles.bar} ${bar.blue ? styles.blue : styles.red}`}
          style={
            {
              top: `${bar.top}%`,
              '--len': `${bar.length}vmin`,
              '--thick': `${bar.thick}vmin`,
              '--jump': `${bar.jump}vmin`,
              '--delay': `${index * -0.37}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
});

export function ScreenFx() {
  const credibility = useGame((s) => s.credibility);
  const raid = useGame((s) => isRaidActive(s.folders));
  const folders = useGame((s) => s.folders);
  const { elapsedMs } = useLevelClock();
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const noFlash = useSettings((s) => s.noFlash);
  const preset = useQuality((s) => s.profile.preset);

  const settings = { reducedMotion, noFlash };
  const vignette = vignetteLevel(credibility);
  const tier = pressureTier(folders, elapsedMs);
  const moving = effectsAnimated(settings);

  if (vignette === 0 && !raid && tier === 0) {
    return null;
  }

  return (
    <div className={styles.layer} aria-hidden="true" data-testid="screen-fx">
      {vignette > 0 && (
        <div
          className={`${styles.vignette} ${moving ? styles.beat : ''}`}
          style={{ '--level': vignette } as CSSProperties}
          data-testid="fx-vignette"
        />
      )}
      {raid && (
        <div
          className={`${styles.glitch} ${glitchAnimated(settings, preset) ? styles.moving : ''}`}
          data-testid="fx-glitch"
        >
          <GlitchEdge side="left" />
          <GlitchEdge side="right" />
        </div>
      )}
      {tier > 0 && (
        <div
          className={`${styles.pressure} ${moving ? (tier === 2 ? styles.fast : styles.slow) : ''}`}
          data-testid="fx-pressure"
          data-tier={tier}
        />
      )}
    </div>
  );
}
