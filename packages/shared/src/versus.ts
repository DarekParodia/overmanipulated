// Pure versus rules (S7-78): how long a match lasts and when, and how, it is decided. The server
// evaluates `versusOutcome` every tick from both newsrooms' standings (S7-80).
import { VERSUS } from './constants.ts';
import type { TeamIndex, VersusEndReason } from './protocol.ts';

/** One newsroom's standing as the match rules see it. */
export type TeamStanding = {
  team: TeamIndex;
  score: number;
  credibility: number;
  /** Every player of the team left and the reconnect grace ran out. */
  forfeited: boolean;
};

export type VersusResult = {
  /** null on a draw. */
  winnerTeam: TeamIndex | null;
  reason: VersusEndReason;
};

/**
 * The match length in ms: the level's own duration, or `VERSUS.endlessDurationS` for endless,
 * which has no natural end.
 */
export function matchDurationMs(level: { durationS: number; endless?: boolean }): number {
  return (level.endless === true ? VERSUS.endlessDurationS : level.durationS) * 1000;
}

/**
 * The match result, or null while it goes on:
 * 1. a team whose credibility ran out, or that forfeited, is out;
 * 2. when exactly one team is still in, it wins (`forfeit` if every out team forfeited, else
 *    `credibility`);
 * 3. when every team is out on the same tick, or time is up, the higher score wins
 *    (equal top scores are a draw).
 */
export function versusOutcome(
  teams: readonly TeamStanding[],
  elapsedMs: number,
  durationMs: number,
): VersusResult | null {
  const out = teams.filter(isOut);
  const alive = teams.filter((team) => !isOut(team));
  const [survivor] = alive;
  if (out.length > 0 && alive.length === 1 && survivor) {
    return {
      winnerTeam: survivor.team,
      reason: out.every((team) => team.forfeited) ? 'forfeit' : 'credibility',
    };
  }
  if ((teams.length > 0 && alive.length === 0) || elapsedMs >= durationMs) {
    return byScore(teams);
  }
  return null;
}

/** The higher score wins; equal top scores (or no teams) are a draw. */
export function byScore(teams: readonly TeamStanding[]): VersusResult {
  const ranked = [...teams].sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  if (!top || (second && second.score === top.score)) {
    return { winnerTeam: null, reason: 'draw' };
  }
  return { winnerTeam: top.team, reason: 'score' };
}

function isOut(team: TeamStanding): boolean {
  return team.credibility <= 0 || team.forfeited;
}
