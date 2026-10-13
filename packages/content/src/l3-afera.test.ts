import { describe, expect, it } from 'bun:test';
import { DIFFICULTIES, type StationKind } from '@redakcja/shared';
import {
  bagSlotTimes,
  decidingStations,
  generateBagLevel,
  isPinned,
  pinnedCounts,
  starThresholds,
} from './bag.ts';
import { checkBag } from './checks.ts';
import { LEVEL_FILES } from './files.ts';
import { getLevel, getStory, STORIES } from './index.ts';
import { maxLevelScore } from './rules.ts';
import { levelFileSchema } from './schema.ts';

// S7-30: l3 Afera part 1 adds pinned stories for the image search (4) and the source registry (2).
// S7-31: part 2 adds 4 stories pinned to the archive.
const PINNED: readonly [string, StationKind][] = [
  ['l3-zalana-sala', 'imageSearch'],
  ['l3-dyrektor-na-plazy', 'imageSearch'],
  ['l3-pusta-stolowka', 'imageSearch'],
  ['l3-pracownia-robotyki', 'imageSearch'],
  ['l3-psycholog-z-sieci', 'sourceRegistry'],
  ['l3-zajecia-przed-matura', 'sourceRegistry'],
  ['l3-stara-afera', 'archive'],
  ['l3-zmyslony-wywiad', 'archive'],
  ['l3-boisko-ze-zbiorki', 'archive'],
  ['l3-dyrektor-bez-dyplomu', 'archive'],
];

describe('l3 Afera new stories', () => {
  const stations = getLevel('l3-afera')?.stations ?? [];

  it('plays on the four l3 stations', () => {
    expect(stations).toEqual(['imageSearch', 'sourceRegistry', 'archive', 'phone']);
  });

  for (const [id, station] of PINNED) {
    it(`pins ${id} to ${station}`, () => {
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
    });
  }

  it('keeps about a third of the new stories true', () => {
    const truths = PINNED.map(([id]) => getStory(id)?.truth);
    expect(truths.filter((truth) => truth === 'true')).toHaveLength(3);
    // Part 2 alone: one true, two false, one misleading.
    expect(PINNED.slice(6).map(([id]) => getStory(id)?.truth)).toEqual([
      'misleading',
      'false',
      'true',
      'false',
    ]);
  });
});

describe('l3 Afera bag', () => {
  const file = levelFileSchema.parse(LEVEL_FILES['levels/l3-afera.json']);
  const byId = new Map(STORIES.map((s) => [s.id, s]));
  const pool = (file.bag?.pool ?? []).flatMap((id) => byId.get(id) ?? []);

  it('deals from a bag of 25 stories with the events unchanged', () => {
    expect(file.schedule).toBeUndefined();
    expect(file.stars).toBeUndefined();
    expect(file.bag).toEqual({
      pool: file.bag?.pool ?? [],
      firstAtS: 4,
      gapS: 24,
      lastSpawnS: 340,
      deadlineS: { normal: 60, important: 60, urgent: 45 },
    });
    expect(pool).toHaveLength(25);
    expect(pool.map((s) => s.id)).toEqual(expect.arrayContaining(PINNED.map(([id]) => id)));
    expect(pool.filter((s) => s.truth === 'true')).toHaveLength(9);
    expect(file.events).toEqual([
      { kind: 'viral', atS: 92, storyId: 'l3-viral-ukryta-kontrola', deadlineS: 50 },
      { kind: 'viral', atS: 200, storyId: 'l3-viral-pakuje-sie', deadlineS: 50 },
      { kind: 'viral', atS: 304, storyId: 'l3-viral-pozegnanie', deadlineS: 50 },
    ]);
  });

  it('has 4 pinned stories on each station', () => {
    expect(pinnedCounts(pool, file.stations)).toEqual(
      new Map([
        ['imageSearch', 4],
        ['sourceRegistry', 4],
        ['archive', 4],
        ['phone', 4],
      ]),
    );
  });

  it('passes the bag checks with no issue: 12, 15, 16 and 18 folders by difficulty', () => {
    const bag = file.bag;
    if (!bag) {
      throw new Error('level 3 has no bag');
    }
    expect(DIFFICULTIES.map((d) => bagSlotTimes(bag, d).length)).toEqual([12, 15, 16, 18]);
    const issues: string[] = [];
    checkBag({ ...file, bag }, byId, (path, severity, message) =>
      issues.push(`${severity} ${path.join('.')}: ${message}`),
    );
    expect(issues).toEqual([]);
  });

  it('ends every dealt folder with the level and takes the stars from the default shares', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 7, 0xffffffff]) {
        const level = generateBagLevel(file, STORIES, seed, difficulty);
        const ids = level.schedule.map((spawn) => spawn.storyId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const spawn of level.schedule) {
          expect(spawn.atS + spawn.deadlineS).toBeLessThanOrEqual(file.durationS);
        }
        expect(level.stars).toEqual(starThresholds(maxLevelScore(level, byId)));
      }
    }
  });

  it('previews a 15-folder Normal run with a maximum of 470 and stars at 260 and 375', () => {
    const level = getLevel('l3-afera');
    if (!level) {
      throw new Error('level 3 missing');
    }
    expect(level.schedule).toHaveLength(15);
    expect(maxLevelScore(level, byId)).toBe(470);
    expect(level.stars).toEqual({ two: 260, three: 375 });
  });
});
