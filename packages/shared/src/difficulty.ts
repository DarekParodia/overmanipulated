// Pure helpers that apply a difficulty preset (`DIFFICULTY` in constants.ts). The simulation only
// ever sees a `SimTuning` (the server derives it from the room's difficulty every tick); the
// client reads the minigame time and mistake limits and the lockout length from here.
import {
  DIFFICULTY,
  type DifficultyPreset,
  MINIGAME_FAIL_LOCKOUT_MS,
  MINIGAME_MIN_MISTAKES,
  MINIGAME_TIME_LIMIT_MS,
} from './constants.ts';
import type { Difficulty } from './domain.ts';

/** The part of a difficulty preset the simulation applies (work time, lockout, penalties). */
export type SimTuning = Pick<
  DifficultyPreset,
  'workTimeFactor' | 'lockoutFactor' | 'penaltyFactor'
>;

export function simTuning(difficulty: Difficulty): SimTuning {
  const { workTimeFactor, lockoutFactor, penaltyFactor } = DIFFICULTY[difficulty];
  return { workTimeFactor, lockoutFactor, penaltyFactor };
}

/** Normal tuning: every factor is 1, so authored values apply unchanged. */
export const NORMAL_TUNING: SimTuning = Object.freeze(simTuning('normal'));

/** Time limit of one minigame attempt; running out counts as a failure. */
export function minigameTimeLimitMs(difficulty: Difficulty): number {
  return Math.round(MINIGAME_TIME_LIMIT_MS * DIFFICULTY[difficulty].minigameTimeFactor);
}

/**
 * Mistakes a minigame allows on this difficulty, from its Normal limit `base`. A minigame that
 * fails on the first mistake (phone, AI scanner) keeps that on every difficulty; the others gain
 * or lose the preset's `extraMistakes`, but never drop below MINIGAME_MIN_MISTAKES.
 */
export function mistakeLimit(base: number, difficulty: Difficulty): number {
  if (base <= 1) return base;
  return Math.max(MINIGAME_MIN_MISTAKES, base + DIFFICULTY[difficulty].extraMistakes);
}

/** How long a failed minigame blocks its station under this tuning (what the sim applies). */
export function tunedLockoutMs(tuning: SimTuning): number {
  return Math.round(MINIGAME_FAIL_LOCKOUT_MS * tuning.lockoutFactor);
}

/** How long a failed minigame blocks its station on this difficulty. */
export function failLockoutMs(difficulty: Difficulty): number {
  return tunedLockoutMs(simTuning(difficulty));
}
