// Run jobs: plain data that a worker thread can execute, so the matrix runs on all cores.
import { prepareLevelRun } from '../../packages/content/src/index.ts';
import { type Difficulty, ENDLESS_LEVEL_ID } from '../../packages/shared/src/index.ts';
import { type RoleSetup, type RunResult, runGame, runScenario } from './game.ts';
import { PROFILES, type ProfileId } from './models.ts';

/** Endless runs are stopped after this much level time if the crew is still alive. */
export const ENDLESS_CAP_S = 20 * 60;

export type Job = {
  /** A campaign level id or `endless`. */
  levelId: string;
  crew: readonly ProfileId[];
  /** The run seed: deals the run (`prepareRun`) and seeds the sim and the bots. */
  seed: number;
  difficulty: Difficulty;
  /** The crew's roles (`--roles`); default `mixed`. */
  roles?: RoleSetup;
  /** False: bots never press their ability (`--no-abilities`). Default true. */
  abilities?: boolean;
};

export function runJob(job: Job): RunResult {
  const crew = job.crew.map((id) => PROFILES[id]);
  const run = prepareLevelRun(job.levelId, { seed: job.seed, difficulty: job.difficulty });
  if (!run) {
    throw new Error(`Unknown level ${job.levelId}`);
  }
  const capS = job.levelId === ENDLESS_LEVEL_ID ? ENDLESS_CAP_S : undefined;
  return runGame(
    runScenario(run, crew, job.seed, capS, {
      ...(job.roles === undefined ? {} : { roles: job.roles }),
      ...(job.abilities === undefined ? {} : { abilities: job.abilities }),
    }),
  );
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

/** The matrix crews whose size is one of `sizes` (a quicker pass, e.g. crews of three only). */
export function crewsOfSizes(sizes: readonly number[]): (readonly ProfileId[])[] {
  const crews = MATRIX_CREWS.filter((crew) => sizes.includes(crew.length));
  if (crews.length === 0) {
    throw new RangeError(`No matrix crew has a size in ${sizes.join(', ')}`);
  }
  return crews;
}

/** The default matrix: every campaign level and endless, by difficulty, skill and crew size. */
export function buildMatrix(options: {
  levels: readonly string[];
  seeds: number;
  endlessSeeds: number;
  includeEndless: boolean;
  difficulties: readonly Difficulty[];
  crews?: readonly (readonly ProfileId[])[];
  roles?: RoleSetup;
  abilities?: boolean;
}): Job[] {
  const jobs: Job[] = [];
  const crews = options.crews ?? MATRIX_CREWS;
  // Only set when asked, so the default matrix's jobs stay plain.
  const extra = {
    ...(options.roles === undefined ? {} : { roles: options.roles }),
    ...(options.abilities === undefined ? {} : { abilities: options.abilities }),
  };
  for (const difficulty of options.difficulties) {
    for (const levelId of options.levels) {
      for (const crew of crews) {
        for (let seed = 1; seed <= options.seeds; seed++) {
          jobs.push({ levelId, crew, seed, difficulty, ...extra });
        }
      }
    }
    if (options.includeEndless) {
      for (const crew of crews) {
        for (let seed = 1; seed <= options.endlessSeeds; seed++) {
          jobs.push({ levelId: ENDLESS_LEVEL_ID, crew, seed, difficulty, ...extra });
        }
      }
    }
  }
  return jobs;
}
