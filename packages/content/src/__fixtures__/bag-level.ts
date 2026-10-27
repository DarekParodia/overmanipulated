// A bag level for checks.test.ts and run.test.ts (S7-21): the greybox schedule fixture with its
// schedule and stars replaced by a station bag, and seven extra greybox stories retargeted so every
// bag station has its pinned target (⌈10 Normal folders / 3 stations⌉ = 4). `thinBagContent` keeps
// only the ten scheduled stories, which cannot cover a run without repeats. Independent of the real
// l0 bag (S7-27), so content edits do not move these expectations.
import type { StationKind } from '@redakcja/shared';
import type { LevelBag, LevelFile, Story } from '../schema.ts';
import { realContent } from './broken.ts';

export type BagContent = { level: LevelFile; stories: Story[] };

/** Normal values of the fixture bag: 10 / 8 / 11 / 12 slots on normal / easy / hard / expert. */
export const FIXTURE_BAG: Omit<LevelBag, 'pool'> = {
  firstAtS: 3,
  gapS: 18,
  lastSpawnS: 175,
  deadlineS: { normal: 60, important: 60, urgent: 45 },
  starShares: { two: 0.5, three: 0.8 },
};

/**
 * A copy of `base` under `id` that only `station` decides: its stamp there becomes the one
 * justifying, decisive stamp; every other decisive stamp becomes irrelevant.
 */
export function retarget(base: Story, id: string, station: StationKind): Story {
  const copy = structuredClone(base);
  copy.id = id;
  const stampId = (kind: StationKind) => `${id}-${kind.toLowerCase()}`;
  copy.stamps = copy.stamps.map((stamp) => ({
    ...stamp,
    id: stampId(stamp.station),
    relevance:
      stamp.station === station
        ? 'decisive'
        : stamp.relevance === 'decisive'
          ? 'irrelevant'
          : stamp.relevance,
  }));
  copy.justifyingStamps = [stampId(station)];
  return copy;
}

function find(stories: readonly Story[], id: string): Story {
  const story = stories.find((s) => s.id === id);
  if (!story) {
    throw new Error(`fixture story ${id} missing`);
  }
  return story;
}

/**
 * The greybox level as a bag level over `pool`. The bag is a deep copy: a test that edits its
 * nested objects (e.g. `deadlineS`) must not change `FIXTURE_BAG` for the test files after it,
 * which share one process and run in any order.
 */
function asBagLevel(level: LevelFile, pool: readonly string[]): LevelFile {
  const { schedule: _schedule, stars: _stars, ...rest } = level;
  return { ...rest, bag: { ...structuredClone(FIXTURE_BAG), pool: [...pool] } };
}

/** 17 stories: the real ten plus image search 4 (one urgent) and archive 3 pinned; 6 true. */
export function bagContent(): BagContent {
  const { level, stories } = realContent();
  const from = (id: string) => find(stories, id);
  const extra = [
    retarget(from('l0-nocny-autobus'), 'l0-bag-lupa-prawda', 'imageSearch'),
    retarget(from('l0-falszywa-straz'), 'l0-bag-lupa-pilne', 'imageSearch'),
    retarget(from('l0-podatek-od-mew'), 'l0-bag-lupa-satyra', 'imageSearch'),
    retarget(from('l0-koncert-na-bulwarach'), 'l0-bag-lupa-plotka', 'imageSearch'),
    retarget(from('l0-nowa-biblioteka'), 'l0-bag-archiwum-prawda', 'archive'),
    retarget(from('l0-woda-z-kranu'), 'l0-bag-archiwum-pilne', 'archive'),
    retarget(from('l0-podatek-od-mew'), 'l0-bag-archiwum-satyra', 'archive'),
  ];
  const all = [...stories, ...extra];
  return {
    level: asBagLevel(
      level,
      all.map((story) => story.id),
    ),
    stories: all,
  };
}

/** Only the ten real greybox stories in the pool: the image search decides just two of them. */
export function thinBagContent(): BagContent {
  const { level, stories } = realContent();
  return {
    level: asBagLevel(
      level,
      stories.map((story) => story.id),
    ),
    stories,
  };
}
