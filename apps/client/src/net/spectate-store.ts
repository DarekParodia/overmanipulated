// What a spectator (Widownia, S7-84) receives, kept apart from the player's own stores: one view
// per newsroom (its GameView: game store, snapshot buffer, feedback), the spectator event feed
// (embargoed in versus), the 1 Hz match stats and each team's level end. Nothing here ever
// reaches `useGame`, the player runtime or the player's gameplay event listeners. A watched
// newsroom's gameplay events go to its own view (S7-90): its listeners and particles, and its
// cues under the spectator audio policy (spectate/spectate-audio.ts). The spectate screen
// (spectate/SpectateScreen.tsx) renders it.
import {
  type LevelEndMessage,
  MAX_TEAMS,
  type MatchStatsMessage,
  type SnapshotMessage,
  type SpectatorEvent,
  type SpectatorEventMessage,
  type TeamIndex,
} from '@redakcja/shared';
import { create } from 'zustand';
import { isSpectatorAudible } from '../spectate/spectate-audio.ts';
import { type GameplayEvent, routeViewEvent } from './game-events.ts';
import type { GameStoreApi } from './game-store.ts';
import { createWatchView, type GameView } from './game-view.ts';
import type { SnapshotBuffer } from './snapshot-buffer.ts';

/** Spectator events kept for the feed; the feed shows the newest few (client presentation). */
export const SPECTATE_EVENTS_KEPT = 32;

/** One watched newsroom: its GameView (S7-85), which a spectator canvas renders. */
export type SpectateView = {
  readonly team: TeamIndex;
  readonly view: GameView;
  /** The view's game store. */
  readonly store: GameStoreApi;
  /** The view's snapshot buffer (its watch runtime renders from it). */
  readonly buffer: SnapshotBuffer;
};

function spectateViewFor(team: TeamIndex): SpectateView {
  const view = createWatchView(team);
  return { team, view, store: view.store, buffer: view.runtime.buffer };
}

const kurierView = spectateViewFor(0);

/** Created once; a co-op match fills team 0 only. */
export const spectateViews: readonly SpectateView[] = [
  kurierView,
  ...Array.from({ length: MAX_TEAMS - 1 }, (_, index) => spectateViewFor(index + 1)),
];

/** The view of a team of this match (team 0's for an index outside MAX_TEAMS). */
export function teamView(team: TeamIndex): SpectateView {
  return spectateViews[team] ?? kurierView;
}

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
  /** Empties every view; with a level id each view also loads that level's room. */
  reset(levelId?: string): void;
};

/**
 * The spectator events a view plays: everything the sim emits in its world. Roster changes and
 * the embargo's masked and revealed results belong to the feed only (S7-91).
 */
export function isViewEvent(event: SpectatorEvent): event is GameplayEvent {
  switch (event.kind) {
    case 'playerJoined':
    case 'playerLeft':
    case 'playerReconnected':
    case 'gameStarted':
    case 'verdictMasked':
    case 'verdictRevealed':
      return false;
    default:
      return true;
  }
}

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
    const view = spectateView(message.team);
    if (view && isViewEvent(message.event)) {
      routeViewEvent(view.view, message.event, isSpectatorAudible);
    }
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
  reset(levelId) {
    for (const view of spectateViews) {
      view.view.runtime.reset(levelId);
      view.store.getState().reset();
    }
    set({ teams: [], events: [], matchStats: null, levelEnds: noLevelEnds() });
  },
}));
