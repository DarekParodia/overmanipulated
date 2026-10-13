// Run preparation (S7-21): turns a level into the run a room plays, for one run seed and
// difficulty. A bag level deals a fresh schedule (`generateBagLevel`), endless generates its own
// (`generateEndlessLevel`, which scales its spawn interval and deadlines), and a level with an
// authored schedule only gets its deadlines scaled (`applyDifficulty`). Pure: the server draws the
// run seed (separate from the sim seed) and calls this once per briefing.
import {
  BAG_PREVIEW_SEED,
  type Difficulty,
  ENDLESS_LEVEL_ID,
  type RunSummary,
  type StoryBook,
  scaledDeadlineS,
} from '@redakcja/shared';
import { generateBagLevel } from './bag.ts';
import { generateEndlessLevel } from './endless.ts';
import { maxLevelScore, storyBookFor } from './rules.ts';
import type { Level, LevelFile, Story } from './schema.ts';

export type RunOptions = {
  /** Run seed: picks the dealt stories and stations; never the sim seed. */
  readonly seed: number;
  readonly difficulty: Difficulty;
};

export type PreparedRun = {
  /** The level as this run plays it: its schedule, deadlines and star thresholds. */
  readonly level: Level;
  /** The stories the run uses (schedule and events), keyed by id. */
  readonly stories: StoryBook & Readonly<Record<string, Story>>;
  /** The score a perfect team can reach in this run. */
  readonly maxScore: number;
  readonly difficulty: Difficulty;
};

/**
 * A level with an authored schedule on a difficulty: every scheduled and event folder deadline is
 * scaled (`scaledDeadlineS`); arrival times, events and the authored stars stay as they are, so
 * Normal returns the level unchanged.
 */
export function applyDifficulty<L extends Level>(level: L, difficulty: Difficulty): L {
  return {
    ...level,
    schedule: level.schedule.map((spawn) => ({
      ...spawn,
      deadlineS: scaledDeadlineS(spawn.deadlineS, difficulty),
    })),
    events: level.events.map((event) =>
      event.kind === 'outage'
        ? event
        : { ...event, deadlineS: scaledDeadlineS(event.deadlineS, difficulty) },
    ),
  };
}

/**
 * A level file as `LEVELS` and `getLevel` serve it: a bag level resolves to its Normal preview
 * run (`BAG_PREVIEW_SEED`), keeping its `bag` so every real run can deal anew; a level with an
 * authored schedule is already resolved.
 */
export function resolveLevel(file: LevelFile, stories: readonly Story[]): Level {
  if (file.bag) {
    return generateBagLevel(file, stories, BAG_PREVIEW_SEED, 'normal');
  }
  const { schedule, stars } = file;
  if (!schedule || !stars) {
    throw new RangeError(`level "${file.id}" has neither a bag nor a schedule with stars`);
  }
  return { ...file, schedule, stars };
}

/**
 * The run a room plays on `base` (a resolved level, as `getLevel` returns it): a bag level deals
 * a new schedule for the seed and difficulty, the endless level generates one (with `levels` and
 * `stories`), any other level has its deadlines scaled. `maxScore` is the run's own.
 */
export function prepareRun(
  base: Level,
  options: RunOptions,
  levels: readonly Level[],
  stories: readonly Story[],
): PreparedRun {
  const { seed, difficulty } = options;
  let level: Level;
  if (base.bag) {
    level = generateBagLevel(base, stories, seed, difficulty);
  } else if (base.id === ENDLESS_LEVEL_ID) {
    level = generateEndlessLevel(seed, levels, stories, difficulty);
  } else {
    level = applyDifficulty(base, difficulty);
  }
  const book = storyBookFor(level, stories);
  return {
    level,
    stories: book,
    maxScore: maxLevelScore(level, new Map(Object.entries(book))),
    difficulty,
  };
}

/** What the lobby and the briefing show of a run: folders dealt, max score, stars (not endless). */
export function runSummary(run: PreparedRun): RunSummary {
  return {
    folders: run.level.schedule.length,
    maxScore: run.maxScore,
    stars: run.level.id === ENDLESS_LEVEL_ID ? null : { ...run.level.stars },
  };
}
