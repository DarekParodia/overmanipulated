import { describe, expect, it } from 'bun:test';
import { BAG_PREVIEW_SEED, DIFFICULTIES, type StationKind } from '@redakcja/shared';
import {
  bagSlotTimes,
  decidingStations,
  generateBagLevel,
  isPinned,
  pinnedCounts,
  starThresholds,
} from './bag.ts';
import { checkBag, maxLevelScore } from './checks.ts';
import { LEVEL_FILES } from './files.ts';
import { getLevel, getStory, STORIES } from './index.ts';
import { levelFileSchema, type Story } from './schema.ts';

// S7-32: l4 Zdrowie part 1 adds pinned stories for the archive (4) and the phone (1).
const PINNED: readonly [string, StationKind][] = [
  ['l4-tlumy-na-sorze', 'archive'],
  ['l4-zimna-woda-po-obiedzie', 'archive'],
  ['l4-ratownik-o-kaskach', 'archive'],
  ['l4-basen-zamkniety', 'archive'],
  ['l4-sobotnie-szczepienia', 'phone'],
];

// S7-33: part 2 adds pinned stories for the source registry (2) and the phone (2).
const PINNED_PART_2: readonly [string, StationKind][] = [
  ['l4-obowiazkowe-szczepienia', 'sourceRegistry'],
  ['l4-rodzice-za-lipowitem', 'sourceRegistry'],
  ['l4-ospa-w-przychodni', 'phone'],
  ['l4-szkoly-zamkniete-w-piatek', 'phone'],
];

const stations = getLevel('l4-zdrowie')?.stations ?? [];

function expectPinned(id: string, station: StationKind): void {
  const story = getStory(id);
  expect(story).toBeDefined();
  if (!story) {
    return;
  }
  expect(story.reviewed).toBe(false);
  expect(story.requiredStamps).toBe(1);
  expect(story.stamps.map((stamp) => stamp.station)).toEqual(stations);
  expect(decidingStations(story, stations)).toEqual([station]);
  expect(isPinned(story, stations)).toBe(true);
  // Only the proof looks decisive, so no other station promises more than it gives.
  expect(
    story.stamps.filter((stamp) => stamp.relevance === 'decisive').map((s) => s.station),
  ).toEqual([station]);
}

describe('l4 Zdrowie part 1 stories', () => {
  it('plays on the four l4 stations', () => {
    expect(stations).toEqual(['sourceRegistry', 'archive', 'phone', 'dataLibrary']);
  });

  for (const [id, station] of PINNED) {
    it(`pins ${id} to ${station}`, () => expectPinned(id, station));
  }

  it('keeps about a third of the new stories true', () => {
    const truths = PINNED.map(([id]) => getStory(id)?.truth);
    expect(truths.filter((truth) => truth === 'true')).toHaveLength(2);
  });
});

describe('l4 Zdrowie part 2: stories, cleanup and the bag', () => {
  const level = getLevel('l4-zdrowie');
  const pool = (level?.bag?.pool ?? []).flatMap((id) => {
    const story = getStory(id);
    return story ? [story] : [];
  });
  const l4Story = (id: string): Story => {
    const story = getStory(id);
    if (!story) {
      throw new Error(`${id} missing`);
    }
    return story;
  };

  for (const [id, station] of PINNED_PART_2) {
    it(`pins ${id} to ${station}`, () => expectPinned(id, station));
  }

  it('keeps one of the four new stories true', () => {
    const truths = PINNED_PART_2.map(([id]) => getStory(id)?.truth);
    expect(truths.filter((truth) => truth === 'true')).toHaveLength(1);
  });

  it('deals the level from a bag of all 24 l4 stories', () => {
    expect(level?.bag).toMatchObject({
      firstAtS: 4,
      gapS: 24,
      lastSpawnS: 340,
      deadlineS: { normal: 55, important: 55, urgent: 40 },
    });
    expect(level?.bag?.starShares).toBeUndefined();
    expect(pool).toHaveLength(24);
    expect(new Set(pool.map((story) => story.id)).size).toBe(24);
    expect(pool.every((story) => story.id.startsWith('l4-'))).toBe(true);
    // The outage event stays.
    expect(level?.events).toEqual([
      { kind: 'outage', atS: 200, station: 'dataLibrary', durationS: 20 },
    ]);
  });

  it('serves the Normal preview run of the bag: 15 folders from 4 s, every 24 s', () => {
    const file = levelFileSchema.parse(LEVEL_FILES['levels/l4-zdrowie.json']);
    expect(level).toEqual(generateBagLevel(file, STORIES, BAG_PREVIEW_SEED, 'normal'));
    expect(level?.schedule.map((spawn) => spawn.atS)).toEqual([
      4, 28, 52, 76, 100, 124, 148, 172, 196, 220, 244, 268, 292, 316, 340,
    ]);
    expect(new Set(level?.schedule.map((spawn) => spawn.storyId)).size).toBe(15);
  });

  it('passes the bag checks with no issue: 12, 15, 16 and 18 folders by difficulty', () => {
    const file = levelFileSchema.parse(LEVEL_FILES['levels/l4-zdrowie.json']);
    const bag = file.bag;
    if (!bag) {
      throw new Error('l4 has no bag');
    }
    expect(DIFFICULTIES.map((d) => bagSlotTimes(bag, d).length)).toEqual([12, 15, 16, 18]);
    const issues: string[] = [];
    checkBag({ ...file, bag }, new Map(STORIES.map((s) => [s.id, s])), (path, severity, message) =>
      issues.push(`${severity} ${path.join('.')}: ${message}`),
    );
    expect(issues).toEqual([]);
  });

  it('ends every dealt folder with the level and takes the stars from the default shares', () => {
    const file = levelFileSchema.parse(LEVEL_FILES['levels/l4-zdrowie.json']);
    const byId = new Map(STORIES.map((s) => [s.id, s]));
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 7, 0xffffffff]) {
        const dealt = generateBagLevel(file, STORIES, seed, difficulty);
        const ids = dealt.schedule.map((spawn) => spawn.storyId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => id.startsWith('l4-'))).toBe(true);
        for (const spawn of dealt.schedule) {
          expect(spawn.atS + spawn.deadlineS).toBeLessThanOrEqual(file.durationS);
        }
        expect(dealt.stars).toEqual(starThresholds(maxLevelScore(dealt, byId)));
      }
    }
  });

  it('pins at least four pool stories on every l4 station', () => {
    expect(Object.fromEntries(pinnedCounts(pool, stations))).toEqual({
      sourceRegistry: 4,
      archive: 4,
      phone: 4,
      dataLibrary: 6,
    });
  });

  it('leaves no decisive stamp that does not justify the verdict', () => {
    const loose = pool.flatMap((story) =>
      story.stamps
        .filter((s) => s.relevance === 'decisive' && !story.justifyingStamps.includes(s.id))
        .map((s) => s.id),
    );
    expect(loose).toEqual([]);
  });

  it('resolves the four former decisive-not-justifying stories', () => {
    expect(decidingStations(l4Story('l4-ankieta-uczniow'), stations)).toEqual([
      'sourceRegistry',
      'phone',
      'dataLibrary',
    ]);
    expect(decidingStations(l4Story('l4-raport-pielegniarek'), stations)).toEqual([
      'sourceRegistry',
      'dataLibrary',
    ]);
    expect(decidingStations(l4Story('l4-darmowe-badania-wzroku'), stations)).toEqual([
      'sourceRegistry',
      'phone',
      'dataLibrary',
    ]);
    // The satire stays pinned to the source registry: the phone call now misleads.
    expect(decidingStations(l4Story('l4-woda-z-kranu'), stations)).toEqual(['sourceRegistry']);
    expect(isPinned(l4Story('l4-woda-z-kranu'), stations)).toBe(true);
  });

  it('asks two proofs on the two multi-stamp picks', () => {
    const report = l4Story('l4-raport-pielegniarek');
    expect(report.requiredStamps).toBe(2);
    expect(report.justifyingStamps).toEqual([
      'l4-raport-pielegniarek-source',
      'l4-raport-pielegniarek-data',
    ]);
    const quote = l4Story('l4-cytat-dyrektorki');
    expect(quote.requiredStamps).toBe(2);
    expect(decidingStations(quote, stations)).toEqual(['archive', 'phone']);
    expect(isPinned(report, stations)).toBe(false);
    expect(isPinned(quote, stations)).toBe(false);
  });
});
