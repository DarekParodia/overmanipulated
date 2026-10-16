// A player's match counters: which events fold into them, and which ones the spectators are
// shown. `applyStatsEvent` is the only counting rule; this module decides which events it sees.
import {
  applyStatsEvent,
  type GameEvent,
  type PlayerStats,
  type SpectatorEvent,
} from '@redakcja/shared';

/** Folds events into players' counters (`applyStatsEvent` is the only rule). */
export function foldStats(stats: Map<string, PlayerStats>, events: readonly GameEvent[]): void {
  for (const event of events) {
    const playerId = 'playerId' in event ? event.playerId : null;
    const current = typeof playerId === 'string' ? stats.get(playerId) : undefined;
    if (current) {
      stats.set(current.playerId, applyStatsEvent(current, event));
    }
  }
}

/**
 * What a spectator event counts for in the spectators' stats: a game event as itself, a revealed
 * verdict as the verdict it was, a masked one (or a revealed expiry) as nothing.
 */
export function shownStatsEvent(event: SpectatorEvent): GameEvent | null {
  if (event.kind === 'verdictMasked') {
    return null;
  }
  if (event.kind === 'verdictRevealed') {
    const { playerId, verdict } = event.result;
    return playerId !== null && verdict !== null
      ? { ...event.result, kind: 'verdictResult', playerId, verdict }
      : null;
  }
  return event;
}
