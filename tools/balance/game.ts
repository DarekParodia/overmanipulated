// Runs one full level with bots through the real `step()` from @redakcja/shared. Deterministic:
// the same setup always gives the same result (the sim RNG and every bot RNG derive from `seed`,
// and the run is dealt by `prepareRun` with the same seed, S7-34).
import type { PreparedRun } from '../../packages/content/src/index.ts';
import {
  addPlayer,
  createGameState,
  type Difficulty,
  ENDLESS_LEVEL_ID,
  folderOnFixture,
  type GameEvent,
  type GameState,
  type LevelEventKind,
  type PlayerInput,
  parseLayout,
  type QueuedCommand,
  type Role,
  type SimContext,
  type SimLevel,
  type SimTuning,
  type StationKind,
  type StoryBook,
  simTuning,
  spawnPoint,
  step,
  TICK_MS,
  type TileMap,
} from '../../packages/shared/src/index.ts';
import { Bot, Team } from './bot.ts';
import { PROFILES, type ProfileId, type SkillProfile } from './models.ts';

/** Roles by crew size, in join order (design doc: roles give a bonus, none blocks a station). */
export const ROLES_BY_CREW: Record<number, readonly Role[]> = {
  1: ['photoEditor'],
  2: ['photoEditor', 'archivist'],
  3: ['photoEditor', 'archivist', 'reporter'],
  4: ['photoEditor', 'archivist', 'reporter', 'managingEditor'],
};

export type StarPair = { two: number; three: number };

export type Scenario = {
  level: SimLevel & { id: string };
  stories: StoryBook;
  crew: readonly SkillProfile[];
  seed: number;
  difficulty: Difficulty;
  /** The tuning the sim applies on this difficulty (`simTuning`). */
  tuning: SimTuning;
  /** Best possible score of this run (`prepareRun`). */
  maxScore: number;
  /** The run's star thresholds; null for endless (no stars). */
  stars: StarPair | null;
  /** Stop a run that lasts longer than this many level seconds (endless). */
  capS?: number;
};

export type RunResult = {
  levelId: string;
  difficulty: Difficulty;
  crew: string;
  crewSize: number;
  seed: number;
  won: boolean;
  /** 0 when lost; endless runs have no stars. */
  stars: number;
  /** The run's star thresholds (bag levels deal their own per seed); null for endless. */
  thresholds: StarPair | null;
  score: number;
  /** Best possible score of the run. */
  maxScore: number;
  /** Level time at the end, in seconds. */
  endedAtS: number;
  /** True when the run hit `capS` while still alive. */
  capped: boolean;
  credibilityMin: number;
  /** Credibility sampled at fixed points: tenths of the level, or every minute in endless. */
  trail: number[];
  spawned: number;
  resolved: number;
  expired: number;
  correct: number;
  wrongJustification: number;
  wrong: number;
  minigameFailures: number;
  /** Level events that started, by kind. */
  events: Partial<Record<LevelEventKind, number>>;
  firstVerdictS: number | null;
  /**
   * Share of the run's ticks in which each of the level's stations had a folder on it or an
   * operator at it (any fixture of that kind).
   */
  stationBusyShare: Partial<Record<StationKind, number>>;
};

const TRAIL_POINTS = 10;

export function runGame(scenario: Scenario): RunResult {
  const { level, stories, crew, seed, difficulty } = scenario;
  const map = parseLayout(level.layout);
  const roles = ROLES_BY_CREW[crew.length] ?? ROLES_BY_CREW[4] ?? [];
  let state = createGameState({ map, seed: seed * 2 + 1 });
  const team = new Team();
  const bots: Bot[] = [];
  crew.forEach((profile, index) => {
    const id = `p${index + 1}`;
    state = addPlayer(state, id, spawnPoint(map, index), roles[index] ?? null);
    bots.push(new Bot(id, profile, team, seed * 1009 + index * 7919 + 13, difficulty));
  });
  const ctx: SimContext = { dtMs: TICK_MS, map, level, stories, tuning: scenario.tuning };
  const load = stationLoad(map, level.stations);

  const endless = level.endless === true;
  const capMs = (scenario.capS ?? level.durationS) * 1000;
  const sampleEveryMs = endless ? 60_000 : (level.durationS * 1000) / TRAIL_POINTS;
  const trail: number[] = [];
  let nextSample = sampleEveryMs;

  const events: Partial<Record<LevelEventKind, number>> = {};
  let correct = 0;
  let wrongJustification = 0;
  let wrong = 0;
  let minigameFailures = 0;
  let firstVerdictMs: number | null = null;
  let credibilityMin = state.credibility;

  while (!state.ended && state.elapsedMs < capMs) {
    const inputs: Record<string, PlayerInput[]> = {};
    const commands: QueuedCommand[] = [];
    bots.forEach((bot) => {
      const out = bot.act(state, ctx);
      inputs[bot.playerId] = [bot.toInput(out)];
      for (const command of out.commands) {
        commands.push({ playerId: bot.playerId, command });
      }
    });
    const result = step(state, inputs, commands, ctx);
    state = result.state;
    for (const event of result.events) {
      tally(event);
    }
    credibilityMin = Math.min(credibilityMin, state.credibility);
    load.sample(state);
    while (state.elapsedMs >= nextSample) {
      trail.push(state.credibility);
      nextSample += sampleEveryMs;
    }
  }

  function tally(event: GameEvent): void {
    switch (event.kind) {
      case 'levelEvent':
        if (event.phase === 'start') {
          events[event.event] = (events[event.event] ?? 0) + 1;
        }
        break;
      case 'minigameFailed':
        minigameFailures++;
        break;
      case 'verdictResult':
        firstVerdictMs ??= state.elapsedMs;
        if (event.outcome === 'correct') {
          correct++;
        } else if (event.outcome === 'wrongJustification') {
          wrongJustification++;
        } else {
          wrong++;
        }
        break;
      default:
        break;
    }
  }

  const ended = state.ended;
  const capped = !ended && state.elapsedMs >= capMs;
  const finalCred = ended?.won === false ? 0 : state.credibility;
  while (trail.length < (endless ? Math.ceil(capMs / sampleEveryMs) : TRAIL_POINTS)) {
    trail.push(finalCred);
  }
  const expired = state.results.filter((r) => r.outcome === 'expired').length;
  return {
    levelId: level.id,
    difficulty,
    crew: crewLabel(crew),
    crewSize: crew.length,
    seed,
    won: ended ? ended.won : capped,
    stars: ended?.stars ?? 0,
    thresholds: scenario.stars,
    score: state.score,
    maxScore: scenario.maxScore,
    endedAtS: state.elapsedMs / 1000,
    capped,
    credibilityMin,
    trail,
    spawned: state.nextFolderNumber - 1,
    // Folders still in play at the end are recorded as unfinished; they were never resolved.
    resolved: state.results.filter((r) => r.outcome !== 'unfinished').length,
    expired,
    correct,
    wrongJustification,
    wrong,
    minigameFailures,
    events,
    firstVerdictS: firstVerdictMs === null ? null : firstVerdictMs / 1000,
    stationBusyShare: load.shares(),
  };
}

/** Counts, tick by tick, how often each station kind of the level is occupied. */
export function stationLoad(
  map: TileMap,
  stations: readonly StationKind[],
): {
  sample(state: GameState): void;
  shares(): Partial<Record<StationKind, number>>;
} {
  const fixturesByKind = new Map(
    stations.map((kind) => [kind, map.fixtures.filter((f) => f.station === kind).map((f) => f.id)]),
  );
  const busy = new Map(stations.map((kind) => [kind, 0]));
  let ticks = 0;
  return {
    sample(state) {
      ticks++;
      for (const [kind, ids] of fixturesByKind) {
        const occupied = ids.some(
          (id) =>
            folderOnFixture(state, id) !== undefined ||
            (state.stations[id]?.operatorId ?? null) !== null,
        );
        if (occupied) {
          busy.set(kind, (busy.get(kind) ?? 0) + 1);
        }
      }
    },
    shares() {
      const out: Partial<Record<StationKind, number>> = {};
      for (const [kind, count] of busy) {
        out[kind] = ticks === 0 ? 0 : count / ticks;
      }
      return out;
    },
  };
}

/** `average` for a uniform crew, `rookie+average+expert` for a mixed one. */
export function crewLabel(crew: readonly SkillProfile[]): string {
  const ids = crew.map((p) => p.id);
  return new Set(ids).size === 1 ? (ids[0] ?? '') : ids.join('+');
}

export function uniformCrew(profile: ProfileId, size: number): SkillProfile[] {
  return Array.from({ length: size }, () => PROFILES[profile]);
}

/**
 * A prepared run (`prepareRun` / `prepareLevelRun`: a dealt bag level, a generated endless level
 * or an authored level with scaled deadlines) as a scenario for one crew and seed.
 */
export function runScenario(
  run: PreparedRun,
  crew: readonly SkillProfile[],
  seed: number,
  capS?: number,
): Scenario {
  const stars = run.level.id === ENDLESS_LEVEL_ID ? null : { ...run.level.stars };
  return {
    level: run.level,
    stories: run.stories,
    crew,
    seed,
    difficulty: run.difficulty,
    tuning: simTuning(run.difficulty),
    maxScore: run.maxScore,
    stars,
    ...(capS === undefined ? {} : { capS }),
  };
}
