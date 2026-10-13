import { describe, expect, it } from 'bun:test';
import { prepareLevelRun } from '../../packages/content/src/index.ts';
import type { SimStory } from '../../packages/shared/src/index.ts';
import { citeStamps, failChance } from './bot.ts';
import type { RunResult } from './game.ts';
import { buildMatrix, crewsOfSizes, runJob } from './jobs.ts';
import { AVERAGE, EXPERT, ROOKIE } from './models.ts';
import {
  difficultyChecks,
  dominantStation,
  intentChecks,
  loadSpread,
  monotonicChecks,
  stationLoadTable,
  summarizeAll,
} from './report.ts';

const story: SimStory = {
  id: 's',
  type: 'photo',
  priority: 'normal',
  truth: 'false',
  correctVerdict: 'reject',
  stamps: [
    { id: 'ai', station: 'aiScanner', relevance: 'decisive' },
    { id: 'img', station: 'imageSearch', relevance: 'decisive' },
    { id: 'phone', station: 'phone', relevance: 'irrelevant' },
    { id: 'reg', station: 'sourceRegistry', relevance: 'decisive' },
  ],
  justifyingStamps: ['ai', 'img', 'reg'],
  requiredStamps: 2,
};

describe('citeStamps', () => {
  it('cites the required number of proofs, never preferring the AI hint', () => {
    expect(citeStamps(story, ['phone', 'ai', 'reg', 'img'])).toEqual(['img', 'reg']);
  });

  it('fills up with the hint, then the rest, when the folder holds too few proofs', () => {
    expect(citeStamps(story, ['phone', 'ai', 'reg'])).toEqual(['reg', 'ai']);
    expect(citeStamps(story, ['phone'])).toEqual(['phone']);
    expect(citeStamps(story, [])).toEqual([]);
  });

  it('cites one stamp for a single-proof story', () => {
    const { requiredStamps: _, ...single } = story;
    expect(citeStamps(single, ['ai', 'reg', 'img'])).toEqual(['img']);
  });
});

describe('failChance', () => {
  it('scales by station and difficulty', () => {
    expect(failChance(AVERAGE, 'archive', 'normal', false)).toBeCloseTo(0.15, 10);
    expect(failChance(AVERAGE, 'archive', 'easy', false)).toBeCloseTo(0.1125, 10);
    expect(failChance(AVERAGE, 'archive', 'expert', false)).toBeCloseTo(0.21, 10);
    expect(failChance(ROOKIE, 'aiScanner', 'hard', false)).toBeCloseTo(0.483, 10);
  });

  it('halves a retry only at a station that keeps its puzzle', () => {
    expect(failChance(AVERAGE, 'sourceRegistry', 'normal', true)).toBeCloseTo(0.0825, 10);
    expect(failChance(AVERAGE, 'sourceRegistry', 'normal', false)).toBeCloseTo(0.165, 10);
    expect(failChance(AVERAGE, 'archive', 'normal', true)).toBeCloseTo(0.15, 10);
  });

  it('caps the chance at 90%', () => {
    expect(failChance({ minigameFailChance: 0.9 }, 'aiScanner', 'expert', false)).toBe(0.9);
    expect(failChance(EXPERT, 'phone', 'normal', false)).toBeCloseTo(0.024, 10);
  });
});

describe('buildMatrix', () => {
  it('runs every crew and seed on each difficulty, in ladder order', () => {
    const jobs = buildMatrix({
      levels: ['l1-burza'],
      seeds: 4,
      endlessSeeds: 2,
      includeEndless: false,
      difficulties: ['easy', 'normal', 'hard', 'expert'],
    });
    expect(jobs).toHaveLength(128);
    expect(jobs[0]).toEqual({
      levelId: 'l1-burza',
      crew: ['rookie', 'rookie', 'rookie'],
      seed: 1,
      difficulty: 'easy',
    });
    expect(jobs[127]?.difficulty).toBe('expert');
    expect(jobs.filter((j) => j.difficulty === 'hard')).toHaveLength(32);
  });

  it('adds endless runs per difficulty', () => {
    const jobs = buildMatrix({
      levels: [],
      seeds: 1,
      endlessSeeds: 2,
      includeEndless: true,
      difficulties: ['normal', 'expert'],
      crews: [['average', 'average', 'average']],
    });
    expect(jobs.map((j) => `${j.levelId}/${j.difficulty}/${j.seed}`)).toEqual([
      'endless/normal/1',
      'endless/normal/2',
      'endless/expert/1',
      'endless/expert/2',
    ]);
  });

  it('keeps only the crews of the asked sizes', () => {
    expect(crewsOfSizes([3]).map((crew) => crew.join('+'))).toEqual([
      'rookie+rookie+rookie',
      'average+average+average',
      'expert+expert+expert',
      'rookie+average+expert',
    ]);
    expect(crewsOfSizes([2, 4])).toHaveLength(4);
    expect(() => crewsOfSizes([5])).toThrow(RangeError);
  });
});

/** A run result with every number zero, overridable per test. */
function run(overrides: Partial<RunResult>): RunResult {
  return {
    levelId: 'l1-burza',
    difficulty: 'normal',
    crew: 'average',
    crewSize: 3,
    seed: 1,
    won: true,
    stars: 2,
    thresholds: { two: 200, three: 300 },
    score: 0,
    maxScore: 400,
    endedAtS: 360,
    capped: false,
    credibilityMin: 100,
    trail: [100],
    spawned: 0,
    resolved: 0,
    expired: 0,
    correct: 0,
    wrongJustification: 0,
    wrong: 0,
    minigameFailures: 0,
    events: {},
    firstVerdictS: null,
    stationBusyShare: {},
    ...overrides,
  };
}

describe('report', () => {
  it('averages station load and score share per level, difficulty and crew', () => {
    const [summary, ...rest] = summarizeAll([
      run({ seed: 1, score: 200, maxScore: 400, stationBusyShare: { archive: 0.6, phone: 0.2 } }),
      run({ seed: 2, score: 300, maxScore: 300, stationBusyShare: { archive: 0.4, phone: 0.1 } }),
    ]);
    expect(rest).toHaveLength(0);
    expect(summary?.scoreShare).toBeCloseTo(0.75, 10);
    expect(summary?.maxScore).toBe(350);
    expect(summary?.stationBusyShare.archive).toBeCloseTo(0.5, 10);
    expect(summary?.stationBusyShare.phone).toBeCloseTo(0.15, 10);
    expect(summary ? loadSpread(summary) : 0).toBeCloseTo(3.33333, 4);
  });

  it('prints the station-load table for the average crews of three and four', () => {
    const summaries = summarizeAll([
      run({ difficulty: 'hard', stationBusyShare: { archive: 0.5, imageSearch: 0.25 } }),
      run({ difficulty: 'easy', stationBusyShare: { archive: 0.2, imageSearch: 0.2 } }),
      run({
        difficulty: 'easy',
        crewSize: 4,
        stationBusyShare: { archive: 0.3, imageSearch: 0.1 },
      }),
      run({ crewSize: 2, stationBusyShare: { archive: 0.6, imageSearch: 0.1 } }),
      run({ crew: 'expert', stationBusyShare: { archive: 0.9, imageSearch: 0.1 } }),
    ]);
    expect(stationLoadTable(summaries)).toBe(
      [
        '| Level | Difficulty | Crew | imageSearch | archive | Spread (max / min) |',
        '| --- | --- | --- | --- | --- | --- |',
        '| l1-burza | easy | ×3 | 20% | 20% | 1.0 |',
        '| l1-burza | easy | ×4 | 10% | 30% | 3.0 |',
        '| l1-burza | hard | ×3 | 25% | 50% | 2.0 |',
      ].join('\n'),
    );
  });

  it('names a station only when it is busy over half the level and over twice the least busy', () => {
    expect(dominantStation({ stationBusyShare: { archive: 0.55, phone: 0.2 } })).toBe('archive');
    expect(dominantStation({ stationBusyShare: { archive: 0.55, phone: 0.3 } })).toBeUndefined();
    expect(dominantStation({ stationBusyShare: { archive: 0.45, phone: 0.1 } })).toBeUndefined();
    expect(dominantStation({ stationBusyShare: {} })).toBeUndefined();
  });

  it('fails the duplicate-station check when a station dominates the average crew of four', () => {
    const checks = intentChecks(
      summarizeAll([
        run({ crewSize: 3, stationBusyShare: { archive: 0.4, phone: 0.3 } }),
        run({ crewSize: 4, stationBusyShare: { archive: 0.6, phone: 0.25 } }),
      ]),
      [],
    );
    const check = checks.find((c) => c.name.startsWith('No station dominates'));
    expect(check).toEqual({
      name: 'No station dominates (busy > 50% and > 2× the least busy, average ×3/×4); else duplicate it',
      ok: false,
      detail: 'l1-burza ×4 archive',
    });
  });

  it('lists endless after the campaign levels in the station-load table', () => {
    const table = stationLoadTable(
      summarizeAll([
        run({ levelId: 'endless', stationBusyShare: { archive: 0.3 } }),
        run({ levelId: 'l4-zdrowie', stationBusyShare: { archive: 0.4 } }),
        run({ levelId: 'l1-burza', stationBusyShare: { archive: 0.5 } }),
      ]),
    );
    expect(
      table
        .split('\n')
        .slice(2)
        .map((row) => row.split(' | ')[0]),
    ).toEqual(['| l1-burza', '| l4-zdrowie', '| endless']);
  });

  it('fails the ladder check when a harder difficulty wins more often', () => {
    const ok = monotonicChecks(
      summarizeAll([
        run({ difficulty: 'easy', won: true, score: 80, maxScore: 100 }),
        run({ difficulty: 'normal', won: true, score: 60, maxScore: 100 }),
        run({ difficulty: 'expert', won: false, score: 60, maxScore: 120 }),
      ]),
    );
    expect(ok.map((c) => c.ok)).toEqual([true, true]);
    expect(ok.map((c) => c.detail)).toEqual([
      'easy 100% >= normal 100% >= expert 0%',
      'easy 80% >= normal 60% >= expert 50%',
    ]);
    const bad = monotonicChecks(
      summarizeAll([
        run({ difficulty: 'normal', won: false, score: 50, maxScore: 100 }),
        run({ difficulty: 'hard', won: true, score: 40, maxScore: 100 }),
      ]),
    );
    expect(bad.map((c) => c.ok)).toEqual([false, true]);
    const share = monotonicChecks(
      summarizeAll([
        run({ difficulty: 'normal', score: 50, maxScore: 100 }),
        run({ difficulty: 'hard', score: 60, maxScore: 100 }),
      ]),
    );
    expect(share.map((c) => c.ok)).toEqual([true, false]);
    expect(monotonicChecks(summarizeAll([run({})]))).toEqual([]);
  });

  it('ladders endless by median survival, not by the win rate', () => {
    const checks = monotonicChecks(
      summarizeAll([
        run({ levelId: 'endless', difficulty: 'easy', endedAtS: 600 }),
        run({ levelId: 'endless', difficulty: 'expert', endedAtS: 660 }),
      ]),
    );
    expect(checks).toEqual([
      {
        name: 'endless: average x3 median survival does not rise from easy to expert',
        ok: false,
        detail: 'easy 10.0 min >= expert 11.0 min',
      },
    ]);
  });

  it('checks the per-difficulty targets over the campaign crews of three', () => {
    const checks = difficultyChecks(
      summarizeAll([
        run({ difficulty: 'easy', crew: 'rookie', won: true }),
        run({ difficulty: 'easy', crew: 'rookie', levelId: 'l4-zdrowie', won: false }),
        run({ difficulty: 'hard', won: true }),
        run({ difficulty: 'expert', crew: 'expert', stars: 2 }),
        run({ difficulty: 'expert', won: false }),
        run({ difficulty: 'expert', crewSize: 4, won: true }),
        run({ difficulty: 'expert', levelId: 'endless', won: false }),
      ]),
    );
    expect(checks.map((c) => [c.name, c.ok, c.detail])).toEqual([
      ['Easy: rookies x3 win >= 80% everywhere', false, 'l1 100%, l4 0%'],
      ['Hard: average x3 wins >= 80% everywhere', true, 'l1 100%'],
      ['Expert: expert x3 reaches 2+ stars in >= 80% everywhere', true, 'l1 100%'],
      ['Expert: average x3 wins >= 50% everywhere', false, 'l1 0%'],
    ]);
    expect(difficultyChecks(summarizeAll([run({})]))).toEqual([]);
  });
});

describe('runJob', () => {
  const job = {
    levelId: 'l1-burza',
    crew: ['average', 'average'],
    seed: 3,
    difficulty: 'hard',
  } as const;

  it('plays the run prepareRun deals for the seed and difficulty, deterministically', () => {
    const first = runJob(job);
    expect(runJob(job)).toEqual(first);
    const dealt = prepareLevelRun(job.levelId, { seed: job.seed, difficulty: job.difficulty });
    expect(first.difficulty).toBe('hard');
    expect(first.maxScore).toBe(dealt?.maxScore ?? -1);
    expect(first.thresholds).toEqual(dealt ? { ...dealt.level.stars } : null);
    expect(Object.keys(first.stationBusyShare).sort()).toEqual(
      [...(dealt?.level.stations ?? [])].sort(),
    );
    for (const share of Object.values(first.stationBusyShare)) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});
