// Match statistics (S7-78): the only accumulator of per-player counters, folded over the sim's
// events by the server (spectator `matchStats`, `levelEnd.stats`) and by the client profile.
import type { FolderResult } from './entities.ts';
import type { GameEvent, PlayerStats, TeamIndex, TeamScore } from './protocol.ts';

export function emptyPlayerStats(playerId: string, team: TeamIndex): PlayerStats {
  return {
    playerId,
    team,
    verdicts: 0,
    correct: 0,
    wrong: 0,
    stamps: 0,
    minigameFails: 0,
    abilities: 0,
  };
}

/**
 * Counts one event for the player it belongs to; any other event (or another player's) returns
 * `stats` unchanged. `wrongJustification` counts as a verdict but neither correct nor wrong.
 */
export function applyStatsEvent(stats: PlayerStats, event: GameEvent): PlayerStats {
  if (!('playerId' in event) || event.playerId !== stats.playerId) {
    return stats;
  }
  switch (event.kind) {
    case 'verdictResult':
      return {
        ...stats,
        verdicts: stats.verdicts + 1,
        correct: stats.correct + (event.outcome === 'correct' ? 1 : 0),
        wrong: stats.wrong + (event.outcome === 'wrong' ? 1 : 0),
      };
    case 'stampApplied':
      return { ...stats, stamps: stats.stamps + 1 };
    case 'minigameFailed':
      return { ...stats, minigameFails: stats.minigameFails + 1 };
    case 'ability':
      return event.stage === 'done' ? { ...stats, abilities: stats.abilities + 1 } : stats;
    default:
      return stats;
  }
}

/**
 * One newsroom's standing from its sim state. `resolved` counts folders closed with a verdict,
 * `expired` the ones that ran out of time (a botRaid wave is one result either way); folders
 * still in play when the level ended (`unfinished`) count in neither.
 */
export function teamScoreOf(
  game: { score: number; credibility: number; results: readonly FolderResult[] },
  team: TeamIndex,
  connected: number,
): TeamScore {
  let resolved = 0;
  let expired = 0;
  for (const result of game.results) {
    if (result.verdict !== null) {
      resolved += 1;
    } else if (result.outcome === 'expired') {
      expired += 1;
    }
  }
  return { team, score: game.score, credibility: game.credibility, resolved, expired, connected };
}
