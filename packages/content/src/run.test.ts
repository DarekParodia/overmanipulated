import { describe, expect, it } from 'bun:test';
import { BAG_PREVIEW_SEED, DIFFICULTIES, ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { bagContent, FIXTURE_BAG } from './__fixtures__/bag-level.ts';
import { realContent } from './__fixtures__/broken.ts';
import { bagDeadlineS, bagSlotTimes, generateBagLevel, starThresholds } from './bag.ts';
import { generateEndlessLevel } from './endless.ts';
import { LEVEL_FILES } from './files.ts';
import { getLevel, LEVELS, prepareLevelRun, STORIES } from './index.ts';
import { levelStoryIds, maxLevelScore, proofCount } from './rules.ts';
import { applyDifficulty, prepareRun, resolveLevel, runSummary } from './run.ts';
import { type Level, levelFileSchema, levelSchema } from './schema.ts';

const { level: bagFile, stories } = bagContent();
const byId = new Map(stories.map((story) => [story.id, story]));
const storyOf = (id: string) => {
  const story = byId.get(id);
  if (!story) {
    throw new Error(`fixture story ${id} missing`);
  }
  return story;
};

describe('generateBagLevel', () => {
  it('deals one folder per slot time, each with its slot station and a story decided there', () => {
    for (const difficulty of DIFFICULTIES) {
      const level = generateBagLevel(bagFile, stories, 11, difficulty);
      expect(level.schedule.map((spawn) => spawn.atS)).toEqual(
        bagSlotTimes(FIXTURE_BAG, difficulty),
      );
      for (const spawn of level.schedule) {
        expect(spawn.station).toBeDefined();
        expect(proofCount(storyOf(spawn.storyId), spawn.station ? [spawn.station] : [])).toBe(1);
      }
      // The fixture pool covers every difficulty, so no story repeats.
      const ids = level.schedule.map((spawn) => spawn.storyId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const lengths = DIFFICULTIES.map(
      (d) => generateBagLevel(bagFile, stories, 11, d).schedule.length,
    );
    expect(lengths).toEqual([8, 10, 11, 12]);
  });

  it('is deterministic per seed and difficulty, and the seed changes the run', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(generateBagLevel(bagFile, stories, 3, difficulty)).toEqual(
        generateBagLevel(bagFile, stories, 3, difficulty),
      );
    }
    const runs = new Set(
      Array.from({ length: 10 }, (_, seed) =>
        JSON.stringify(generateBagLevel(bagFile, stories, seed, 'normal').schedule),
      ),
    );
    expect(runs.size).toBeGreaterThan(1);
  });

  it('scales deadlines by priority: urgent 45 s becomes 59 s on easy', () => {
    const deadlines = (difficulty: (typeof DIFFICULTIES)[number]) => {
      const { schedule } = generateBagLevel(bagFile, stories, 4, difficulty);
      const pairs = schedule.map(
        (spawn) => `${storyOf(spawn.storyId).priority}:${spawn.deadlineS}`,
      );
      return [...new Set(pairs)].sort();
    };
    expect(deadlines('easy')).toEqual(['important:78', 'normal:78', 'urgent:59']);
    expect(deadlines('normal')).toEqual(['important:60', 'normal:60', 'urgent:45']);
  });

  it('takes the stars from the run maximum and the level shares', () => {
    const level = generateBagLevel(bagFile, stories, 9, 'hard');
    const max = maxLevelScore(level, byId);
    expect(level.stars).toEqual(starThresholds(max, { two: 0.5, three: 0.8 }));
    expect(level.bag).toEqual(bagFile.bag);
  });

  it('keeps event times and scales their deadlines', () => {
    const file = {
      ...bagFile,
      events: [
        { kind: 'viral' as const, atS: 30, storyId: 'l0-zalany-rynek', deadlineS: 60 },
        { kind: 'outage' as const, atS: 90, station: 'archive' as const, durationS: 20 },
      ],
    };
    expect(generateBagLevel(file, stories, 1, 'easy').events).toEqual([
      { kind: 'viral', atS: 30, storyId: 'l0-zalany-rynek', deadlineS: 78 },
      { kind: 'outage', atS: 90, station: 'archive', durationS: 20 },
    ]);
  });

  it('produces a resolved level that passes levelSchema on every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 0xffffffff]) {
        const level = generateBagLevel(bagFile, stories, seed, difficulty);
        expect(levelSchema.safeParse(level).success).toBe(true);
      }
    }
  });

  it('throws for a level without a bag', () => {
    const { level } = realContent();
    expect(() => generateBagLevel(level, stories, 1, 'normal')).toThrow('has no bag');
  });
});

describe('bagDeadlineS', () => {
  const bag = { deadlineS: { normal: 55, important: 75, urgent: 45 } };

  it('scales the priority deadline', () => {
    const urgent = { priority: 'urgent' as const };
    expect(DIFFICULTIES.map((d) => bagDeadlineS(bag, urgent, 100, 420, d))).toEqual([
      59, 45, 38, 34,
    ]);
  });

  it('clamps a two-proof folder at 340 s on a 420 s level to 60 s', () => {
    const story = { priority: 'important' as const, requiredStamps: 2 };
    expect(bagDeadlineS(bag, story, 340, 420, 'normal')).toBe(60);
    expect(bagDeadlineS(bag, story, 340, 420, 'easy')).toBe(60);
    expect(bagDeadlineS(bag, story, 330.4, 420, 'expert')).toBe(56);
    expect(bagDeadlineS(bag, story, 328, 420, 'hard')).toBe(64);
  });

  it('never drops below BAG_MIN_DEADLINE_S', () => {
    expect(bagDeadlineS(bag, { priority: 'normal' }, 400, 420, 'normal')).toBe(30);
  });
});

describe('prepareRun and applyDifficulty', () => {
  // Level 5 keeps its authored schedule until M4 (S7-60).
  const l5 = getLevel('l5-deepfake');
  if (!l5) {
    throw new Error('level 5 missing');
  }

  it('leaves a fixed level unchanged on Normal', () => {
    const run = prepareRun(l5, { seed: 7, difficulty: 'normal' }, LEVELS, STORIES);
    expect(run.level).toEqual(l5);
    expect(run.maxScore).toBe(maxLevelScore(l5, new Map(STORIES.map((s) => [s.id, s]))));
    const eventIds = l5.events.flatMap((event) => (event.kind === 'outage' ? [] : [event.storyId]));
    expect(Object.keys(run.stories).sort()).toEqual(
      [...new Set([...l5.schedule.map((spawn) => spawn.storyId), ...eventIds])].sort(),
    );
    expect(runSummary(run)).toEqual({
      folders: l5.schedule.length,
      maxScore: run.maxScore,
      stars: l5.stars,
    });
  });

  it('scales only the deadlines of a fixed level', () => {
    const easy = applyDifficulty(l5, 'easy');
    expect(easy.schedule.map((spawn) => spawn.atS)).toEqual(l5.schedule.map((spawn) => spawn.atS));
    expect(easy.stars).toEqual(l5.stars);
    expect(l5.schedule[0]?.deadlineS).toBe(60);
    expect(easy.schedule[0]?.deadlineS).toBe(78);
    expect(prepareRun(l5, { seed: 1, difficulty: 'easy' }, LEVELS, STORIES).level).toEqual(easy);
  });

  it('deals a bag level anew for every seed and difficulty from its preview', () => {
    const preview = resolveLevel(bagFile, stories);
    expect(preview).toEqual(generateBagLevel(bagFile, stories, 0, 'normal'));
    const run = prepareRun(preview, { seed: 5, difficulty: 'expert' }, LEVELS, stories);
    expect(run.level).toEqual(generateBagLevel(bagFile, stories, 5, 'expert'));
    expect(run.difficulty).toBe('expert');
    expect(runSummary(run)).toEqual({
      folders: 12,
      maxScore: run.maxScore,
      stars: starThresholds(run.maxScore, { two: 0.5, three: 0.8 }),
    });
    expect(levelStoryIds(preview)).toEqual(bagFile.bag?.pool ?? []);
  });

  it('generates endless per seed and difficulty with scaled deadlines and no stars', () => {
    const endless = getLevel(ENDLESS_LEVEL_ID);
    if (!endless) {
      throw new Error('endless preview missing');
    }
    const normal = prepareRun(endless, { seed: 3, difficulty: 'normal' }, LEVELS, STORIES);
    const expert = prepareRun(endless, { seed: 3, difficulty: 'expert' }, LEVELS, STORIES);
    expect(normal.level.schedule[0]?.deadlineS).toBe(80);
    expect(expert.level.schedule[0]?.deadlineS).toBe(60);
    expect(expert.level).toEqual(generateEndlessLevel(3, LEVELS, STORIES, 'expert'));
    expect(runSummary(expert).folders).toBeGreaterThan(runSummary(normal).folders);
    expect(runSummary(expert).stars).toBeNull();
    expect('endless' in expert.level && expert.level.endless).toBe(true);
  });

  it('prepares a bundled level by id', () => {
    const run = prepareLevelRun('l5-deepfake', { seed: 2, difficulty: 'hard' });
    expect(run?.level.schedule.map((spawn) => spawn.atS)).toEqual(l5.schedule.map((s) => s.atS));
    expect(prepareLevelRun('l9-nie-ma', { seed: 2, difficulty: 'hard' })).toBeUndefined();
  });

  it('deals bundled level 1 from its bag: 16 folders on hard, a new deal per seed', () => {
    const file = levelFileSchema.parse(LEVEL_FILES['levels/l1-burza.json']);
    const run = prepareLevelRun('l1-burza', { seed: 2, difficulty: 'hard' });
    expect(run?.level).toEqual(generateBagLevel(file, STORIES, 2, 'hard'));
    expect(run?.level.schedule).toHaveLength(16);
    expect(run?.level.schedule[0]?.atS).toBe(4);
    const other = prepareLevelRun('l1-burza', { seed: 3, difficulty: 'hard' });
    expect(other?.level.schedule).not.toEqual(run?.level.schedule);
  });
});

describe('LEVELS', () => {
  const files = Object.values(LEVEL_FILES).map((file) => levelFileSchema.parse(file));

  it('serves every level with an authored schedule exactly as its file', () => {
    const fixed = files.filter((level) => !level.bag).map((level) => levelSchema.parse(level));
    expect(LEVELS.filter((level: Level) => !level.bag)).toEqual(fixed);
  });

  it('serves every bag level as its Normal preview run', () => {
    const bagged = files.filter((level) => level.bag);
    expect(bagged.map((level) => level.id)).toEqual(
      expect.arrayContaining(['l0-greybox', 'l1-burza']),
    );
    expect(LEVELS.map((level) => level.id)).toEqual(files.map((level) => level.id));
    expect(LEVELS.filter((level) => level.bag)).toEqual(
      bagged.map((level) => generateBagLevel(level, STORIES, BAG_PREVIEW_SEED, 'normal')),
    );
  });
});
