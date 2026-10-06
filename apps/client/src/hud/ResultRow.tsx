// One folder on the level-end page: what it was, what the team did, what it cost or earned.

import type { FolderResult } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { formatDelta } from './hud-model.ts';
import styles from './ResultsPlate.module.css';
import { hudStory } from './story-lookup.ts';

export function ResultRow({ result }: { result: FolderResult }) {
  const story = hudStory(result.storyId);
  const tone =
    result.outcome === 'correct'
      ? styles.rowGood
      : result.outcome === 'wrongJustification'
        ? styles.rowCaution
        : styles.rowBad;
  return (
    <li className={`${styles.row} ${tone}`}>
      <span className={styles.rowMark}>
        <Icon
          name={result.outcome === 'expired' || !result.verdict ? 'expired' : result.verdict}
          size={18}
          label={result.verdict ? pl.vocab.verdicts[result.verdict] : pl.results.outcomes.expired}
        />
      </span>
      <span className={styles.rowHeadline}>{typeset(story?.headline ?? pl.hud.untitled)}</span>
      <span className={styles.rowOutcome}>{pl.results.outcomes[result.outcome]}</span>
      <span className={styles.rowDelta}>
        {pl.results.scoreDelta(formatDelta(result.scoreDelta))}
      </span>
      <span className={styles.rowDelta}>
        {result.credibilityDelta !== 0
          ? pl.results.credibilityDelta(formatDelta(result.credibilityDelta))
          : ''}
      </span>
    </li>
  );
}
