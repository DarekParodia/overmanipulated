// Run jobs: plain data that a worker thread can execute, so the matrix runs on all cores.
import { LEVELS, STORIES } from '../../packages/content/src/index.ts';
import { ENDLESS_LEVEL_ID } from '../../packages/shared/src/index.ts';
import { endlessScenario, levelScenario, type RunResult, runGame } from './game.ts';
import { PROFILES, type ProfileId } from './models.ts';

/** Endless runs are stopped after this much level time if the crew is still alive. */
export const ENDLESS_CAP_S = 20 * 60;

export type Job = {
  /** A campaign level id or `endless`. */
  levelId: string;
  crew: readonly ProfileId[];
  seed: number;
};

export function runJob(job: Job): RunResult {
  const crew = job.crew.map((id) => PROFILES[id]);
  if (job.levelId === ENDLESS_LEVEL_ID) {
    return runGame(endlessScenario(LEVELS, STORIES, crew, job.seed, ENDLESS_CAP_S));
  }
  const level = LEVELS.find((l) => l.id === job.levelId);
  if (!level) {
    throw new Error(`Unknown level ${job.levelId}`);
  }
  return runGame(levelScenario(level, crew, job.seed));
}

/** Crews of the default matrix: three players by skill (and mixed), plus other crew sizes. */
export const MATRIX_CREWS: readonly (readonly ProfileId[])[] = [
  ['rookie', 'rookie', 'rookie'],
  ['average', 'average', 'average'],
  ['expert', 'expert', 'expert'],
  ['rookie', 'average', 'expert'],
  ['average', 'average'],
  ['average', 'average', 'average', 'average'],
  ['rookie', 'rookie', 'rookie', 'rookie'],
  ['expert', 'expert'],
];

/** The default matrix: every campaign level and endless, by skill and crew size. */
export function buildMatrix(options: {
  levels: readonly string[];
  seeds: number;
  endlessSeeds: number;
  includeEndless: boolean;
  crews?: readonly (readonly ProfileId[])[];
}): Job[] {
  const jobs: Job[] = [];
  const crews = options.crews ?? MATRIX_CREWS;
  for (const levelId of options.levels) {
    for (const crew of crews) {
      for (let seed = 1; seed <= options.seeds; seed++) {
        jobs.push({ levelId, crew, seed });
      }
    }
  }
  if (options.includeEndless) {
    for (const crew of crews) {
      for (let seed = 1; seed <= options.endlessSeeds; seed++) {
        jobs.push({ levelId: ENDLESS_LEVEL_ID, crew, seed });
      }
    }
  }
  return jobs;
}
