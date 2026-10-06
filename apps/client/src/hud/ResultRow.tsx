// One folder on the results panel: an outcome disc (✓ / ✗ / hourglass), the headline with a
// one-word outcome under it, and the points it earned or cost.
import type { FolderResult } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { HudGlyph } from './HudGlyph.tsx';
import { formatDelta } from './hud-model.ts';
import styles from './ResultsPlate.module.css';
import { hudStory } from './story-lookup.ts';

const TONE = {
  correct: styles.rowGood,
  wrongJustification: styles.rowCaution,
  wrong: styles.rowBad,
  expired: styles.rowBad,
} as const;

const MARK = {
  correct: 'publish',
  wrongJustification: 'publish',
  wrong: 'reject',
  expired: 'expired',
} as const;

export function ResultRow({ result }: { result: FolderResult }) {
  const story = hudStory(result.storyId);
  return (
    <li className={`${styles.row} ${TONE[result.outcome]}`}>
      <span className={styles.rowMark}>
        <Icon name={MARK[result.outcome]} size={22} />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowHeadline}>{typeset(story?.headline ?? pl.hud.untitled)}</span>
        <span className={styles.rowOutcome}>{pl.results.outcomes[result.outcome]}</span>
      </span>
      {result.credibilityDelta !== 0 && (
        <span
          className={styles.rowCred}
          role="img"
          aria-label={pl.results.credibilityDelta(formatDelta(result.credibilityDelta))}
        >
          <HudGlyph
            name={result.credibilityDelta < 0 ? 'shieldCracked' : 'shield'}
            size={18}
            fill={result.credibilityDelta < 0 ? 'var(--red)' : 'var(--green)'}
          />
          <span aria-hidden>{formatDelta(result.credibilityDelta)}</span>
        </span>
      )}
      <span className={styles.rowPoints}>
        {pl.results.scoreDelta(formatDelta(result.scoreDelta))}
      </span>
    </li>
  );
}
