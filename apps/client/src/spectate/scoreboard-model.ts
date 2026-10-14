// The spectate screen's top-bar scoreboard (S7-90), pure: one side per watched newsroom with its
// points and credibility (from the newsroom's own view, 10 Hz), its closed and expired folders
// (from the versus scoreboard of the snapshots, else the 1 Hz match stats) and, in versus, a
// crown for the newsroom ahead (none on a tie).
import type { TeamIndex, TeamScore } from '@redakcja/shared';

export type ScoreSide = {
  team: TeamIndex;
  score: number;
  credibility: number;
  /** Folders closed with a verdict. */
  resolved: number;
  /** Folders that ran out of time. */
  expired: number;
  /** Versus only: this newsroom has strictly more points than every other. */
  leader: boolean;
};

export type LiveScore = { score: number; credibility: number };

export function scoreSides(
  teams: readonly TeamIndex[],
  live: (team: TeamIndex) => LiveScore,
  standings: readonly TeamScore[] | null,
): ScoreSide[] {
  const sides = teams.map((team) => {
    const standing = standings?.find((entry) => entry.team === team);
    return {
      team,
      ...live(team),
      resolved: standing?.resolved ?? 0,
      expired: standing?.expired ?? 0,
      leader: false,
    };
  });
  if (sides.length < 2) {
    return sides;
  }
  const top = Math.max(...sides.map((side) => side.score));
  const leaders = sides.filter((side) => side.score === top);
  return sides.map((side) => ({ ...side, leader: leaders.length === 1 && side.score === top }));
}
