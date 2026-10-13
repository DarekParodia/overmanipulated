// Shared evidence helpers for the minigames (S7-52). Every minigame turns the folder's story and
// the stamp its station gives into a seeded puzzle; these helpers keep that mapping identical
// across stations. The API is deliberately small:
//
// - `problemFromStamp(story, stamp)`: does this station show a problem? Pure, no RNG.
// - `hashText(text)`: FNV-1a (re-exported from the shared sim), to fold the headline and stamp
//   text into a puzzle seed without any new content field.
// - `shuffled(rng, items)`: a shuffled copy (Fisher–Yates; consumes `items.length - 1` draws).
// - `pick(rng, items)`: one item (consumes one draw; throws on an empty pool).
//
// A minigame without a stamp for its station rolls its own chance:
// `problemFromStamp(story, stamp) ?? rng.next() < MY_PROBLEM_CHANCE`. The `??` keeps the RNG
// untouched when a stamp decides, so the puzzle stream is the same as before the helper existed.
import type { Stamp, Story } from '@redakcja/content';
import { hashText, type Rng } from '@redakcja/shared';

export type { Rng };
export { hashText };

/**
 * Whether the station shows a problem, consistent with the stamp it gives for the story:
 * a decisive stamp proves the story, so it shows a problem exactly when the story is untrue;
 * a misleading stamp points the wrong way (a problem behind a true story); an irrelevant stamp
 * shows nothing wrong. Without a stamp the station decides nothing: `null`, the caller rolls.
 */
export function problemFromStamp(
  story: Pick<Story, 'truth'>,
  stamp: Pick<Stamp, 'relevance'> | undefined,
): boolean | null {
  if (!stamp) {
    return null;
  }
  const isTrue = story.truth === 'true';
  switch (stamp.relevance) {
    case 'decisive':
      return !isTrue;
    case 'misleading':
      return isTrue;
    case 'irrelevant':
      return false;
  }
}

/** Fisher–Yates on a copy. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** One item of a non-empty pool. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.int(items.length)];
  if (item === undefined) {
    throw new Error('empty pool');
  }
  return item;
}
