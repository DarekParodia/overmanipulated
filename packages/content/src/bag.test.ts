import { describe, expect, it } from 'bun:test';
import { createRng, type StationKind } from '@redakcja/shared';
import {
  AI_HINT_STORY,
  BAG_FIXTURE_POOL,
  BAG_FIXTURE_STATIONS,
  bagStory,
  DECISIVE_ONLY_STORY,
  MULTI_STAMP_BAG_STORY,
} from './__fixtures__/bag.ts';
import {
  assignStories,
  bagDrawer,
  bagSlotTimes,
  bagStations,
  decidingStations,
  isPinned,
  matchStories,
  pinnedCounts,
  starThresholds,
  stationSequence,
} from './bag.ts';

const SEEDS = Array.from({ length: 50 }, (_, i) => i);
const IS = 'imageSearch';
const A = 'archive';
const SR = 'sourceRegistry';

const ids = (stories: readonly ({ id: string } | undefined)[]) => stories.map((s) => s?.id);

describe('bagSlotTimes', () => {
  const bag = { firstAtS: 4, gapS: 24, lastSpawnS: 340 };

  it('gives 12 / 15 / 16 / 18 slots from easy to expert, ending at 320.8 / 340 / 328 / 330.4', () => {
    const runs = (['easy', 'normal', 'hard', 'expert'] as const).map((d) => bagSlotTimes(bag, d));
    expect(runs.map((times) => times.length)).toEqual([12, 15, 16, 18]);
    expect(runs.map((times) => times.at(-1))).toEqual([320.8, 340, 328, 330.4]);
    expect(runs.map((times) => times[0])).toEqual([4, 4, 4, 4]);
  });

  it('spaces Normal slots by the authored gap', () => {
    expect(bagSlotTimes(bag, 'normal')).toEqual([
      4, 28, 52, 76, 100, 124, 148, 172, 196, 220, 244, 268, 292, 316, 340,
    ]);
    expect(bagSlotTimes(bag, 'expert').slice(0, 4)).toEqual([4, 23.2, 42.4, 61.6]);
  });

  it('gives the level 0 bag 8 / 10 / 11 / 12 slots', () => {
    const l0 = { firstAtS: 3, gapS: 18, lastSpawnS: 175 };
    const lengths = (['easy', 'normal', 'hard', 'expert'] as const).map(
      (d) => bagSlotTimes(l0, d).length,
    );
    expect(lengths).toEqual([8, 10, 11, 12]);
  });

  it('rejects a gap that is not positive', () => {
    expect(() => bagSlotTimes({ firstAtS: 4, gapS: 0, lastSpawnS: 340 }, 'normal')).toThrow();
  });
});

describe('bagDrawer', () => {
  it('deals whole shuffled rounds and never the same item twice in a row', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (const seed of SEEDS) {
      const draw = bagDrawer(items, createRng(seed));
      const drawn = Array.from({ length: 100 }, draw);
      for (let round = 0; round < 20; round++) {
        expect([...drawn.slice(round * 5, round * 5 + 5)].sort()).toEqual(items);
      }
      for (let i = 1; i < drawn.length; i++) {
        expect(drawn[i]).not.toBe(drawn[i - 1]);
      }
    }
  });

  it('repeats a single item and refuses an empty list', () => {
    const draw = bagDrawer(['only'], createRng(1));
    expect([draw(), draw(), draw()]).toEqual(['only', 'only', 'only']);
    expect(() => bagDrawer([], createRng(1))).toThrow();
  });
});

describe('stationSequence', () => {
  const four: StationKind[] = [IS, A, SR, 'phone'];

  it('deals 18 slots over 4 stations as 5, 5, 4, 4, each block of 4 a permutation', () => {
    for (const seed of SEEDS) {
      const sequence = stationSequence(four, 18, createRng(seed));
      expect(sequence).toHaveLength(18);
      const counts = four.map((station) => sequence.filter((s) => s === station).length);
      expect(counts.sort((x, y) => y - x)).toEqual([5, 5, 4, 4]);
      for (let block = 0; block < 4; block++) {
        expect([...sequence.slice(block * 4, block * 4 + 4)].sort()).toEqual([...four].sort());
      }
      const tail = sequence.slice(16);
      expect(new Set(tail).size).toBe(2);
      for (let i = 1; i < sequence.length; i++) {
        expect(sequence[i]).not.toBe(sequence[i - 1]);
      }
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(stationSequence(four, 18, createRng(7))).toEqual(
      stationSequence(four, 18, createRng(7)),
    );
    const distinct = new Set(
      SEEDS.map((seed) => stationSequence(four, 18, createRng(seed)).join()),
    );
    expect(distinct.size).toBeGreaterThan(1);
    expect(stationSequence(four, 0, createRng(7))).toEqual([]);
  });
});

describe('deciding stations', () => {
  it('does not count a decisive stamp that does not justify the verdict', () => {
    expect(DECISIVE_ONLY_STORY.stamps.find((s) => s.station === IS)?.relevance).toBe('decisive');
    expect(decidingStations(DECISIVE_ONLY_STORY, BAG_FIXTURE_STATIONS)).toEqual([SR]);
    expect(isPinned(DECISIVE_ONLY_STORY, BAG_FIXTURE_STATIONS)).toBe(true);
    // A level whose image search only ever gives decisive-not-justifying stamps has no IS slots.
    expect(bagStations([DECISIVE_ONLY_STORY, AI_HINT_STORY], BAG_FIXTURE_STATIONS)).toEqual([SR]);
  });

  it('never counts a hint-only station, even when its stamp justifies', () => {
    expect(decidingStations(AI_HINT_STORY, BAG_FIXTURE_STATIONS)).toEqual([SR]);
    expect(bagStations(BAG_FIXTURE_POOL, BAG_FIXTURE_STATIONS)).toEqual([IS, A, SR]);
  });

  it('keeps only the level stations, in level order', () => {
    expect(decidingStations(MULTI_STAMP_BAG_STORY, BAG_FIXTURE_STATIONS)).toEqual([IS, A]);
    expect(decidingStations(MULTI_STAMP_BAG_STORY, [A, SR])).toEqual([A]);
    expect(decidingStations(MULTI_STAMP_BAG_STORY, [SR])).toEqual([]);
  });

  it('treats multi-stamp stories as flex, never pinned', () => {
    expect(isPinned(MULTI_STAMP_BAG_STORY, BAG_FIXTURE_STATIONS)).toBe(false);
    const oneStation = bagStory('m-one', [IS], { requiredStamps: 2 });
    expect(isPinned(oneStation, BAG_FIXTURE_STATIONS)).toBe(false);
    expect(isPinned(bagStory('flex', [IS, A]), BAG_FIXTURE_STATIONS)).toBe(false);
  });

  it('counts pinned stories per bag station, zero included', () => {
    expect(pinnedCounts(BAG_FIXTURE_POOL, BAG_FIXTURE_STATIONS)).toEqual(
      new Map([
        [IS, 3],
        [A, 3],
        [SR, 4],
      ]),
    );
    const flexOnly = [bagStory('flex-is-sr', [IS, SR])];
    expect(pinnedCounts(flexOnly, BAG_FIXTURE_STATIONS)).toEqual(
      new Map([
        [IS, 0],
        [SR, 0],
      ]),
    );
  });
});

describe('matchStories', () => {
  const storyA = bagStory('A', [IS]);
  const storyB = bagStory('B', [IS, SR]);

  it('re-routes along augmenting paths: {A:[IS], B:[IS,SR]} gives B → SR, A → IS', () => {
    for (const seed of SEEDS) {
      const pool = [storyA, storyB];
      expect(ids(matchStories([SR, IS], pool, BAG_FIXTURE_STATIONS, createRng(seed)))).toEqual([
        'B',
        'A',
      ]);
      expect(ids(matchStories([IS, SR], pool, BAG_FIXTURE_STATIONS, createRng(seed)))).toEqual([
        'A',
        'B',
      ]);
    }
  });

  it('covers every slot with distinct stories its station decides when the pool allows', () => {
    for (const seed of SEEDS) {
      const stations = bagStations(BAG_FIXTURE_POOL, BAG_FIXTURE_STATIONS);
      const sequence = stationSequence(stations, 12, createRng(seed));
      const matched = matchStories(
        sequence,
        BAG_FIXTURE_POOL,
        BAG_FIXTURE_STATIONS,
        createRng(seed),
      );
      expect(matched.every((story) => story !== undefined)).toBe(true);
      expect(new Set(ids(matched)).size).toBe(12);
      matched.forEach((story, slot) => {
        const station = sequence[slot];
        expect(station && story && decidingStations(story, BAG_FIXTURE_STATIONS)).toContain(
          station as StationKind,
        );
      });
    }
  });

  it('opens with single-proof, non-urgent stories and holds multi-stamp ones until slot 4', () => {
    for (const seed of SEEDS) {
      const sequence = stationSequence([IS, A, SR], 12, createRng(seed));
      const matched = matchStories(
        sequence,
        BAG_FIXTURE_POOL,
        BAG_FIXTURE_STATIONS,
        createRng(seed),
      );
      for (const slot of [0, 1]) {
        expect(matched[slot]?.priority).not.toBe('urgent');
      }
      for (const slot of [0, 1, 2, 3]) {
        expect(matched[slot]?.requiredStamps ?? 1).toBe(1);
      }
    }
  });

  it('still uses an early multi-stamp story when nothing else can fill the slot', () => {
    for (const seed of SEEDS) {
      const pool = [MULTI_STAMP_BAG_STORY, bagStory('is-1', [IS])];
      expect(ids(matchStories([IS, IS], pool, BAG_FIXTURE_STATIONS, createRng(seed)))).toEqual([
        'is-1',
        'multi-is-a',
      ]);
    }
  });

  it('leaves a slot empty when the pool cannot cover it without a repeat', () => {
    const pool = [bagStory('is-1', [IS]), bagStory('is-2', [IS]), bagStory('a-1', [A])];
    const matched = matchStories([IS, IS, IS], pool, BAG_FIXTURE_STATIONS, createRng(3));
    expect(matched.filter((story) => story === undefined)).toHaveLength(1);
    expect(new Set(ids(matched.filter((story) => story !== undefined)))).toEqual(
      new Set(['is-1', 'is-2']),
    );
  });

  it('matches as many slots as a plain maximum matching on random pools', () => {
    const kinds: StationKind[] = [IS, A, SR];
    /** Reference: plain Kuhn over slot → story edges, no preferences. */
    const maximum = (sequence: StationKind[], pool: ReturnType<typeof bagStory>[]) => {
      const owner = new Map<number, number>();
      const tryAssign = (slot: number, seen: Set<number>): boolean =>
        pool.some((story, i) => {
          if (seen.has(i) || !decidingStations(story, kinds).includes(sequence[slot] ?? IS)) {
            return false;
          }
          seen.add(i);
          const current = owner.get(i);
          if (current === undefined || tryAssign(current, seen)) {
            owner.set(i, slot);
            return true;
          }
          return false;
        });
      return sequence.filter((_, slot) => tryAssign(slot, new Set())).length;
    };
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      const pool = Array.from({ length: 2 + rng.int(6) }, (_, i) => {
        const proves = kinds.filter(() => rng.next() < 0.45);
        const chosen = proves.length > 0 ? proves : [kinds[rng.int(3)] as StationKind];
        return bagStory(`s${i}`, chosen, {
          priority: rng.next() < 0.2 ? 'urgent' : 'normal',
          ...(chosen.length > 1 && rng.next() < 0.4 ? { requiredStamps: 2 } : {}),
        });
      });
      const sequence = Array.from({ length: 1 + rng.int(8) }, () => kinds[rng.int(3)] ?? IS);
      const matched = matchStories(sequence, pool, BAG_FIXTURE_STATIONS, createRng(seed));
      const filled = matched.filter((story) => story !== undefined);
      expect(new Set(filled).size).toBe(filled.length);
      expect(filled.length).toBe(maximum(sequence, pool));
    }
  });

  it('usually spends pinned stories first and tries flex ones first about 30% of the time', () => {
    const pool = [bagStory('sr-1', [SR]), bagStory('flex', [IS, SR])];
    const flexFirst = Array.from({ length: 400 }, (_, seed) =>
      matchStories([SR], pool, BAG_FIXTURE_STATIONS, createRng(seed)),
    ).filter(([story]) => story?.id === 'flex').length;
    expect(flexFirst).toBeGreaterThan(80);
    expect(flexFirst).toBeLessThan(160);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const sequence = stationSequence([IS, A, SR], 12, createRng(5));
    const run = (seed: number) =>
      ids(matchStories(sequence, BAG_FIXTURE_POOL, BAG_FIXTURE_STATIONS, createRng(seed)));
    expect(run(11)).toEqual(run(11));
    expect(new Set(SEEDS.map((seed) => run(seed).join())).size).toBeGreaterThan(1);
  });
});

describe('assignStories', () => {
  it('equals the matching when the matching covers every slot', () => {
    const sequence = stationSequence([IS, A, SR], 12, createRng(9));
    expect(assignStories(sequence, BAG_FIXTURE_POOL, BAG_FIXTURE_STATIONS, createRng(9))).toEqual(
      matchStories(sequence, BAG_FIXTURE_POOL, BAG_FIXTURE_STATIONS, createRng(9)).flatMap((s) =>
        s ? [s] : [],
      ),
    );
  });

  it('repeats the least-used story of the station, never back to back when avoidable', () => {
    const pool = [bagStory('is-1', [IS]), bagStory('is-2', [IS]), bagStory('a-1', [A])];
    for (const seed of SEEDS) {
      const assigned = ids(
        assignStories([IS, IS, IS, IS], pool, BAG_FIXTURE_STATIONS, createRng(seed)),
      );
      expect(assigned.filter((id) => id === 'is-1')).toHaveLength(2);
      expect(assigned.filter((id) => id === 'is-2')).toHaveLength(2);
      for (let i = 1; i < assigned.length; i++) {
        expect(assigned[i]).not.toBe(assigned[i - 1]);
      }
    }
  });

  it('falls back to the whole pool for a station that decides nothing', () => {
    const pool = [bagStory('is-1', [IS]), bagStory('a-1', [A])];
    expect(ids(assignStories(['phone', IS], pool, BAG_FIXTURE_STATIONS, createRng(1)))).toEqual([
      'a-1',
      'is-1',
    ]);
    expect(() => assignStories([IS], [], BAG_FIXTURE_STATIONS, createRng(1))).toThrow();
    expect(assignStories([], [], BAG_FIXTURE_STATIONS, createRng(1))).toEqual([]);
  });
});

describe('starThresholds', () => {
  it('reproduces the authored thresholds from the levels’ maxima and shares', () => {
    expect(starThresholds(240, { two: 0.5, three: 0.8 })).toEqual({ two: 120, three: 190 });
    expect(starThresholds(375, { two: 0.55, three: 0.85 })).toEqual({ two: 205, three: 320 });
    // Level 2 authored 206; the run rule rounds to 5.
    expect(starThresholds(375)).toEqual({ two: 205, three: 300 });
    expect(starThresholds(440)).toEqual({ two: 240, three: 350 });
    expect(starThresholds(395)).toEqual({ two: 215, three: 315 });
    expect(starThresholds(435)).toEqual({ two: 240, three: 350 });
    expect(starThresholds(450)).toEqual({ two: 250, three: 360 });
  });

  it('keeps three stars above two and within reach on tiny maxima', () => {
    expect(starThresholds(19, { two: 0.55, three: 0.95 })).toEqual({ two: 10, three: 15 });
    expect(starThresholds(10)).toEqual({ two: 5, three: 10 });
    expect(starThresholds(0)).toEqual({ two: 5, three: 10 });
  });
});
