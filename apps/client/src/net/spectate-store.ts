// What a spectator (Widownia, S7-84) receives, kept apart from the player's own stores: one view
// per newsroom (its game store and snapshot buffer), the spectator event feed (embargoed in
// versus), the 1 Hz match stats and each team's level end. Nothing here ever reaches `useGame`,
// the player runtime or the gameplay event listeners. The spectate screen (S7-90/91) renders it.
import {
  type LevelEndMessage,
  MAX_TEAMS,
  type MatchStatsMessage,
  type SnapshotMessage,
  type SpectatorEventMessage,
  type TeamIndex,
} from '@redakcja/shared';
import { create } from 'zustand';
import { createGameStore, type GameStoreApi } from './game-store.ts';
import { createSnapshotBuffer, type SnapshotBuffer } from './snapshot-buffer.ts';

/** Spectator events kept for the feed; the feed shows the newest few (client presentation). */
export const SPECTATE_EVENTS_KEPT = 32;

/** One watched newsroom. */
export type SpectateView = {
  readonly team: TeamIndex;
  readonly store: GameStoreApi;
  readonly buffer: SnapshotBuffer;
};

/** Created once; a co-op match fills team 0 only. */
export const spectateViews: readonly SpectateView[] = Array.from(
  { length: MAX_TEAMS },
  (_, team) => ({ team, store: createGameStore(), buffer: createSnapshotBuffer() }),
);

type SpectateStore = {
  /** Teams that sent a snapshot this match, ascending (1 in co-op, 2 in versus). */
  teams: readonly TeamIndex[];
  /** Latest spectator events, oldest first, at most SPECTATE_EVENTS_KEPT. */
  events: readonly SpectatorEventMessage[];
  matchStats: MatchStatsMessage | null;
  /** Each team's level end, indexed by team; null until it arrives. */
  levelEnds: readonly (LevelEndMessage | null)[];
  applySnapshot(message: SnapshotMessage, receivedAt: number): void;
  applyEvent(message: SpectatorEventMessage): void;
  applyMatchStats(message: MatchStatsMessage): void;
  applyLevelEnd(message: LevelEndMessage): void;
  reset(): void;
};

function noLevelEnds(): (LevelEndMessage | null)[] {
  return Array.from({ length: MAX_TEAMS }, () => null);
}

/** The view a message belongs to; a message without a team is co-op (team 0). */
export function spectateView(team: TeamIndex | undefined): SpectateView | undefined {
  return spectateViews[team ?? 0];
}

export const useSpectate = create<SpectateStore>((set, get) => ({
  teams: [],
  events: [],
  matchStats: null,
  levelEnds: noLevelEnds(),
  applySnapshot(message, receivedAt) {
    const view = spectateView(message.team);
    if (!view) {
      return;
    }
    view.buffer.push(message, receivedAt);
    view.store.getState().applySnapshot(message);
    const { teams } = get();
    if (!teams.includes(view.team)) {
      set({ teams: [...teams, view.team].sort((a, b) => a - b) });
    }
  },
  applyEvent(message) {
    set({ events: [...get().events, message].slice(-SPECTATE_EVENTS_KEPT) });
  },
  applyMatchStats(message) {
    set({ matchStats: message });
  },
  applyLevelEnd(message) {
    const view = spectateView(message.team);
    if (!view) {
      return;
    }
    view.store.getState().setLevelEnd(message);
    const levelEnds = [...get().levelEnds];
    levelEnds[view.team] = message;
    set({ levelEnds });
  },
  reset() {
    for (const view of spectateViews) {
      view.buffer.clear();
      view.store.getState().reset();
    }
    set({ teams: [], events: [], matchStats: null, levelEnds: noLevelEnds() });
  },
}));
