// The Widownia's stats sheet and the spectator results' stats table (S7-91), pure: one row per
// player of each newsroom, from the server's per-player counters (`matchStats` while the match
// runs, `levelEnd.stats` once it ended). While the versus embargo holds a verdict back
// (feed-model.ts `PendingVerdict`), the row counts it among the verdicts given but not in the
// accuracy: the server's counters only take a verdict in once its result is revealed, so the
// accuracy never says how a masked verdict went.
import type { LobbyPlayer, PlayerStats, TeamIndex } from '@redakcja/shared';
import type { PendingVerdict } from './feed-model.ts';

export type StatsRow = {
  playerId: string;
  nickname: string;
  colorIndex: number;
  connected: boolean;
  /** Verdicts given, the masked ones included. */
  verdicts: number;
  /** Verdicts whose result is still masked (versus). */
  pending: number;
  /** Percent of revealed verdicts that were correct; null before the first one. */
  accuracy: number | null;
  stamps: number;
  minigameFails: number;
  abilities: number;
};

export type StatsTeam = { team: TeamIndex; rows: StatsRow[] };

/** round(100 × correct / verdicts), or null with no verdict yet. */
export function accuracyOf(correct: number, verdicts: number): number | null {
  return verdicts > 0 ? Math.round((100 * correct) / verdicts) : null;
}

/**
 * The stats of `teams`, in team order, each with its players in join order (the room's roster).
 * A player without counters yet shows zeros; a player who left the room is not shown.
 */
export function statsTeams(
  teams: readonly TeamIndex[],
  roster: readonly LobbyPlayer[],
  stats: readonly PlayerStats[],
  pending: readonly PendingVerdict[] = [],
): StatsTeam[] {
  return teams.map((team) => ({
    team,
    rows: roster
      .filter((player) => player.team === team)
      .map((player) => {
        const counters = stats.find((entry) => entry.playerId === player.id);
        const masked = pending.filter((entry) => entry.playerId === player.id).length;
        const revealed = counters?.verdicts ?? 0;
        return {
          playerId: player.id,
          nickname: player.nickname,
          colorIndex: player.colorIndex,
          connected: player.connected,
          verdicts: revealed + masked,
          pending: masked,
          accuracy: accuracyOf(counters?.correct ?? 0, revealed),
          stamps: counters?.stamps ?? 0,
          minigameFails: counters?.minigameFails ?? 0,
          abilities: counters?.abilities ?? 0,
        };
      }),
  }));
}
