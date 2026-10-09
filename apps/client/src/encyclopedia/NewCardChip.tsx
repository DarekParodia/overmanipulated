// „Nowa karta!” in the Kolegium: the debrief records the techniques of the level's stories, and
// the cards that were new pop in as a chip next to the title (the chip's pop is a CSS animation,
// off under reduced motion). Tapping it opens the encyclopedia on the first new card.
import { useEffect, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Encyclopedia.module.css';
import { useEncyclopedia } from './store.ts';

/**
 * Records the stories of a finished level once and returns the cards that just unlocked. The cue
 * fires when `ready` turns true (the reveal is over), so it never talks over the star sounds.
 */
export function useNewCards(storyIds: readonly string[], ready: boolean): string[] {
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const recorded = useRef(false);
  const announced = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a level end is recorded once
  useEffect(() => {
    if (recorded.current) {
      return;
    }
    recorded.current = true;
    setUnlocked(useEncyclopedia.getState().record(storyIds));
  }, []);

  useEffect(() => {
    if (ready && unlocked.length > 0 && !announced.current) {
      announced.current = true;
      emitCue('encyclopedia.unlock');
    }
  }, [ready, unlocked]);

  return ready ? unlocked : [];
}

/** `compact` (the phone ribbon) drops the words on very narrow screens, keeping the icon. */
export function NewCardChip({
  cardIds,
  compact = false,
}: {
  cardIds: readonly string[];
  compact?: boolean;
}) {
  const first = cardIds[0];
  if (first === undefined) {
    return null;
  }
  return (
    <button
      type="button"
      className={`${styles.newChip} ${compact ? styles.newCompact : ''}`}
      data-testid="new-card"
      aria-label={`${pl.encyclopedia.newCard} ${pl.encyclopedia.seeCard}`}
      onClick={() => {
        emitCue('ui.click');
        useEncyclopedia.getState().show(first);
      }}
    >
      <Icon name="book" size={22} />
      <span className={styles.newLabel}>{pl.encyclopedia.newCard}</span>
      {cardIds.length > 1 && (
        <span className={styles.newMore}>{pl.encyclopedia.moreCards(cardIds.length)}</span>
      )}
    </button>
  );
}
