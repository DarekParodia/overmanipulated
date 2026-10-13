// Runs one full level with bots through the real `step()` from @redakcja/shared. Deterministic:
// the same setup always gives the same result (the sim RNG and every bot RNG derive from `seed`).
import { maxLevelScore } from '../../packages/content/src/checks.ts';
import {
  generateEndlessLevel,
  storiesForEndless,
  storiesForLevel,
} from '../../packages/content/src/index.ts';
import type { Level, Story } from '../../packages/content/src/schema.ts';
import {
  addPlayer,
  createGameState,
  type GameEvent,
  type LevelEventKind,
  type PlayerInput,
  parseLayout,
  type QueuedCommand,
  type Role,
  type SimContext,
  type SimLevel,
  type StoryBook,
  spawnPoint,
  step,
  TICK_MS,
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

export type Scenario = {
  level: SimLevel & Pick<Level, 'id'>;
  /** The content level, for the maximum score; absent for generated endless levels. */
  contentLevel?: Level;
  stories: StoryBook;
  crew: readonly SkillProfile[];
  seed: number;
  /** Stop a run that lasts longer than this many level seconds (endless). */
  capS?: number;
};

export type RunResult = {
  levelId: string;
  crew: string;
  crewSize: number;
  seed: number;
  won: boolean;
  /** 0 when lost; endless runs have no stars. */
  stars: number;
  score: number;
  /** Best possible score of the level (0 when unknown). */
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
};

const TRAIL_POINTS = 10;

export function runGame(scenario: Scenario): RunResult {
  const { level, stories, crew, seed } = scenario;
  const map = parseLayout(level.layout);
  const roles = ROLES_BY_CREW[crew.length] ?? ROLES_BY_CREW[4] ?? [];
  let state = createGameState({ map, seed: seed * 2 + 1 });
  const team = new Team();
  const bots: Bot[] = [];
  crew.forEach((profile, index) => {
    const id = `p${index + 1}`;
    state = addPlayer(state, id, spawnPoint(map, index), roles[index] ?? null);
    bots.push(new Bot(id, profile, team, seed * 1009 + index * 7919 + 13));
  });
  const ctx: SimContext = { dtMs: TICK_MS, map, level, stories };

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
  const maxScore = scenario.contentLevel
    ? maxLevelScore(scenario.contentLevel, storyMap(stories))
    : 0;
  return {
    levelId: level.id,
    crew: crewLabel(crew),
    crewSize: crew.length,
    seed,
    won: ended ? ended.won : capped,
    stars: ended?.stars ?? 0,
    score: state.score,
    maxScore,
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
  };
}

function storyMap(stories: StoryBook) {
  return new Map(Object.entries(stories) as [string, Story][]) as ReadonlyMap<string, Story>;
}

/** `average` for a uniform crew, `rookie+average+expert` for a mixed one. */
export function crewLabel(crew: readonly SkillProfile[]): string {
  const ids = crew.map((p) => p.id);
  return new Set(ids).size === 1 ? (ids[0] ?? '') : ids.join('+');
}

export function uniformCrew(profile: ProfileId, size: number): SkillProfile[] {
  return Array.from({ length: size }, () => PROFILES[profile]);
}

/** A campaign level as a scenario. */
export function levelScenario(level: Level, crew: readonly SkillProfile[], seed: number): Scenario {
  return {
    level,
    contentLevel: level,
    stories: storiesForLevel(level),
    crew,
    seed,
  };
}

/** A generated endless level (the seed also seeds the schedule). */
export function endlessScenario(
  levels: readonly Level[],
  stories: Parameters<typeof generateEndlessLevel>[2],
  crew: readonly SkillProfile[],
  seed: number,
  capS: number,
): Scenario {
  const level = generateEndlessLevel(seed, levels, stories);
  return { level, stories: storiesForEndless(level, stories), crew, seed, capS };
}
