// Human behaviour models for the balance bots. Every number here is an ASSUMPTION about how
// students play, chosen to be plausible, not measured. Replace them with data from the playtests
// (docs/playtests, S3-09) and re-run `bun run balance`; docs/balance.md explains the limits.
import type { Difficulty, StationKind } from '../../packages/shared/src/index.ts';

export type Range = readonly [min: number, max: number];

export type SkillProfile = {
  id: 'rookie' | 'average' | 'expert';
  label: string;
  /** Pause before taking the next job after finishing one (ms, uniform). */
  reactionMs: Range;
  /** Time spent reading the folder at the desk before the verdict is sent (ms, uniform). */
  verdictThinkMs: Range;
  /** Share of full walking speed actually used (hesitation, detours). */
  walkFactor: number;
  /** Chance that one minigame attempt fails (before the station difficulty factor). */
  minigameFailChance: number;
  /** Multiplier on the base minigame duration. */
  minigameSpeed: number;
  /** Chance, per folder, of knowing which station carries the decisive stamp. */
  insight: number;
  /** Chance of recognising a justifying stamp once it is on the folder (else keeps checking). */
  recognise: number;
  /** Chance of the correct verdict when holding a justifying stamp. */
  verdictAccuracy: number;
  /** Chance of the correct verdict when guessing without one. */
  guessAccuracy: number;
  /** Chance of citing the wrong stamp as the justification despite holding the right one. */
  wrongJustification: number;
  /** Chance, per folder, that a "normal" priority folder is ignored while others wait. */
  ignoreNormal: number;
  /** Stations visited per folder before giving up and going to the desk. */
  patience: number;
  /** Chance of recognising a correction folder and filing it with context straight away. */
  recogniseCorrection: number;
  /** Chance of obeying a boss call at once, without checking the folder. */
  obeyBoss: number;
  /** Chance that the bot uses its role ability (Przedłużenie in an emergency, S7-37). */
  usesAbility: number;
  /** Failed attempts at one station before giving up on it. */
  maxStationFailures: number;
};

export const ROOKIE: SkillProfile = {
  id: 'rookie',
  label: 'rookie',
  reactionMs: [1500, 3500],
  verdictThinkMs: [4000, 8000],
  walkFactor: 0.8,
  minigameFailChance: 0.35,
  minigameSpeed: 1.5,
  insight: 0.25,
  recognise: 0.7,
  verdictAccuracy: 0.8,
  guessAccuracy: 0.35,
  wrongJustification: 0.35,
  ignoreNormal: 0.5,
  patience: 3,
  recogniseCorrection: 0.5,
  obeyBoss: 0.4,
  usesAbility: 0,
  maxStationFailures: 3,
};

export const AVERAGE: SkillProfile = {
  id: 'average',
  label: 'average',
  reactionMs: [600, 1500],
  verdictThinkMs: [2500, 4500],
  walkFactor: 0.92,
  minigameFailChance: 0.15,
  minigameSpeed: 1,
  insight: 0.6,
  recognise: 0.92,
  verdictAccuracy: 0.95,
  guessAccuracy: 0.45,
  wrongJustification: 0.1,
  ignoreNormal: 0,
  patience: 4,
  recogniseCorrection: 0.9,
  obeyBoss: 0.1,
  usesAbility: 0.5,
  maxStationFailures: 4,
};

export const EXPERT: SkillProfile = {
  id: 'expert',
  label: 'expert',
  reactionMs: [250, 700],
  verdictThinkMs: [1500, 3000],
  walkFactor: 0.97,
  minigameFailChance: 0.03,
  minigameSpeed: 0.75,
  insight: 1,
  recognise: 0.97,
  verdictAccuracy: 0.98,
  guessAccuracy: 0.6,
  wrongJustification: 0.02,
  ignoreNormal: 0,
  patience: 6,
  recogniseCorrection: 1,
  obeyBoss: 0,
  usesAbility: 1,
  maxStationFailures: 5,
};

export const PROFILES = { rookie: ROOKIE, average: AVERAGE, expert: EXPERT } as const;
export type ProfileId = keyof typeof PROFILES;

/** Mean time (s) a player needs to solve the minigame of each station at "average" speed. */
export const MINIGAME_BASE_S: Record<StationKind, number> = {
  imageSearch: 9,
  archive: 11,
  sourceRegistry: 9,
  phone: 7,
  aiScanner: 6,
  dataLibrary: 10,
  // Stage 7 stations (S7-48): design estimates until bot data exists (S7-66).
  geolocation: 10,
  transcript: 11,
  crossCheck: 8,
  metadata: 8,
};

/** Relative chance of failing, by station (how fiddly the puzzle is). */
export const MINIGAME_DIFFICULTY: Record<StationKind, number> = {
  imageSearch: 1,
  archive: 1,
  sourceRegistry: 1.1,
  phone: 0.8,
  aiScanner: 1.2,
  dataLibrary: 1.2,
  geolocation: 1.1,
  transcript: 1.1,
  crossCheck: 1.2,
  metadata: 1,
};

/** Spread of a minigame duration around its mean: uniform in [1 - s, 1 + s]. */
export const MINIGAME_SPREAD = 0.3;
/** A failing attempt ends this share of the way through a normal one (mistakes come early). */
export const MINIGAME_FAIL_AT = 0.6;

/**
 * How much more often a minigame attempt fails on each difficulty: Easy allows an extra mistake
 * and more time, Expert one mistake less and less time (DIFFICULTY in constants.ts). The bot's
 * time cap follows the real limit (`minigameTimeLimitMs`); this factor models the rest.
 */
export const DIFFICULTY_FAIL_FACTOR: Record<Difficulty, number> = {
  easy: 0.75,
  normal: 1,
  hard: 1.15,
  expert: 1.4,
};

/**
 * A retry at a station that keeps its puzzle (MINIGAME_STABLE_SEED_STATIONS: the Kartoteka shows
 * the same card again) fails this much less often: the player has seen the card once.
 */
export const RETRY_FAIL_FACTOR = 0.5;

/** No attempt fails more often than this, whatever the factors multiply to. */
export const MAX_FAIL_CHANCE = 0.9;
