// What a spectator (Widownia, S7-84) receives, kept apart from the player's own stores: one view
// per newsroom (its GameView: game store, snapshot buffer, feedback), the spectator event feed
// (embargoed in versus), the 1 Hz match stats and each team's level end. Nothing here ever
// reaches `useGame`, the player runtime or the player's gameplay event listeners. A watched
// newsroom's gameplay events go to its own view (S7-90): its listeners and particles, and its
// cues under the spectator audio policy (spectate/spectate-audio.ts). The spectate screen
// (spectate/SpectateScreen.tsx) renders it. S7-91 adds the event feed (spectate/feed-model.ts),
// the verdicts the embargo still masks (for the stats sheet) and the followed player, whom each
// view's camera and name tags follow while the player is in its newsroom.
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
import {
  type FeedItem,
  type PendingVerdict,
  pendingAfter,
  pushFeed,
} from '../spectate/feed-model.ts';
import { isSpectatorAudible } from '../spectate/spectate-audio.ts';
import { useApp } from '../store/app.ts';
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
  // The view's subject is the followed player while they play in this newsroom.
  const view = createWatchView(team, undefined, () => followedIn(team));
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
  /** The event feed, newest first (S7-91). */
  feed: readonly FeedItem[];
  /** Id of the next feed row (rows are keyed by it). */
  feedSeq: number;
  /** Verdicts given whose result the versus embargo still holds. */
  pending: readonly PendingVerdict[];
  /** The followed player (S7-91), or null to watch whole newsrooms. */
  followed: string | null;
  follow(playerId: string | null): void;
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

/** The followed player when they play in `team`'s newsroom (the room's roster says), else null. */
function followedIn(team: TeamIndex): string | null {
  const followed = useSpectate.getState().followed;
  if (followed === null) {
    return null;
  }
  const player = useApp.getState().room?.players.find((entry) => entry.id === followed);
  return player?.team === team ? followed : null;
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
  feed: [],
  feedSeq: 0,
  pending: [],
  followed: null,
  follow(playerId) {
    set({ followed: playerId });
  },
  applyEvent(message) {
    const { events, feed, feedSeq, pending } = get();
    const nextFeed = pushFeed(feed, message, feedSeq);
    set({
      events: [...events, message].slice(-SPECTATE_EVENTS_KEPT),
      feed: nextFeed,
      feedSeq: nextFeed === feed ? feedSeq : feedSeq + 1,
      pending: pendingAfter(pending, message),
    });
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
    set({
      teams: [],
      events: [],
      matchStats: null,
      levelEnds: noLevelEnds(),
      feed: [],
      pending: [],
      followed: null,
    });
  },
}));
