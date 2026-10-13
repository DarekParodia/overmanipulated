// Station bag fixtures for bag.test.ts: small pools of stories that carry only what the bag reads
// (stamps, justifying stamps, priority, requiredStamps). Every story has one stamp per station of
// BAG_FIXTURE_STATIONS; stamps from `proves` justify it, `decisiveOnly` stamps are decisive but do
// not, and the rest are irrelevant.
import type { Priority, SimStamp, StationKind } from '@redakcja/shared';
import type { BagStory } from '../bag.ts';

/** The fixture level's stations, in level order; the AI scanner is hint-only. */
export const BAG_FIXTURE_STATIONS: readonly StationKind[] = [
  'imageSearch',
  'archive',
  'sourceRegistry',
  'aiScanner',
];

type FixtureStory = Omit<BagStory, 'stamps'> & { stamps: readonly SimStamp[] };

export function bagStory(
  id: string,
  proves: readonly StationKind[],
  options: {
    priority?: Priority;
    requiredStamps?: number;
    decisiveOnly?: readonly StationKind[];
  } = {},
): FixtureStory {
  const stamps = BAG_FIXTURE_STATIONS.map(
    (station): SimStamp => ({
      id: `${id}-${station}`,
      station,
      relevance:
        proves.includes(station) || options.decisiveOnly?.includes(station)
          ? 'decisive'
          : 'irrelevant',
    }),
  );
  return {
    id,
    priority: options.priority ?? 'normal',
    ...(options.requiredStamps === undefined ? {} : { requiredStamps: options.requiredStamps }),
    stamps,
    justifyingStamps: proves.map((station) => `${id}-${station}`),
  };
}

/**
 * The story whose only decisive image-search stamp does not justify the verdict: the source
 * registry proves it, so the image search does not decide it and it is pinned to the registry.
 */
export const DECISIVE_ONLY_STORY = bagStory('decisive-only', ['sourceRegistry'], {
  decisiveOnly: ['imageSearch'],
});

/** Justified by the source registry and the AI scanner; the hint never counts, so it is pinned. */
export const AI_HINT_STORY = bagStory('ai-hint', ['sourceRegistry', 'aiScanner']);

/** A two-proof story decided at the image search and the archive: always flex. */
export const MULTI_STAMP_BAG_STORY = bagStory('multi-is-a', ['imageSearch', 'archive'], {
  priority: 'important',
  requiredStamps: 2,
});

/**
 * A mixed pool over the three non-hint stations: pinned image search 3 (one urgent), archive 3,
 * source registry 4 (with the decisive-only and AI-hint stories); flex image search + registry,
 * archive + registry, and the multi-stamp story.
 */
export const BAG_FIXTURE_POOL: readonly FixtureStory[] = [
  bagStory('is-1', ['imageSearch']),
  bagStory('is-2', ['imageSearch']),
  bagStory('is-urgent', ['imageSearch'], { priority: 'urgent' }),
  bagStory('a-1', ['archive']),
  bagStory('a-2', ['archive']),
  bagStory('a-3', ['archive'], { priority: 'important' }),
  bagStory('sr-1', ['sourceRegistry']),
  bagStory('sr-2', ['sourceRegistry']),
  DECISIVE_ONLY_STORY,
  AI_HINT_STORY,
  bagStory('flex-is-sr', ['imageSearch', 'sourceRegistry']),
  bagStory('flex-a-sr', ['archive', 'sourceRegistry']),
  MULTI_STAMP_BAG_STORY,
];
