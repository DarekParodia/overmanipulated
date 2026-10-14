// The practice round („Wypróbuj”, S7-97): which story and seed a station's practice deals. Pure:
// attempt n of a station takes the n-th story (round the list) that has a stamp for that
// station, so the minigame plays as it does on a folder that needs it, and every „Jeszcze raz”
// brings the next story and the next seed.
import { STORIES, type Story } from '@redakcja/content';
import type { StationKind } from '@redakcja/shared';

type WithStamps = { readonly stamps: readonly { readonly station: StationKind }[] };

/** The `attempt`-th (from 0, wrapping) of `stories` with a stamp for `kind`; none without one. */
export function pickPracticeStory<S extends WithStamps>(
  kind: StationKind,
  attempt: number,
  stories: readonly S[],
): S | undefined {
  const fitting = stories.filter((story) => story.stamps.some((stamp) => stamp.station === kind));
  if (fitting.length === 0) {
    return undefined;
  }
  const index = ((Math.trunc(attempt) % fitting.length) + fitting.length) % fitting.length;
  return fitting[index];
}

/** The story of practice attempt `attempt` at a `kind` station, from the game's own stories. */
export function practiceStory(kind: StationKind, attempt: number): Story | undefined {
  return pickPracticeStory(kind, attempt, STORIES);
}

/** The minigame seed of practice attempt `attempt`: never 0, a new puzzle every attempt. */
export function practiceSeed(attempt: number): number {
  return attempt + 1;
}
