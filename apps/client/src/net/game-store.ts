// Latest authoritative gameplay state besides player positions (those go through the snapshot
// buffer and prediction): folders, stations, desks, score, credibility, level timer, and the
// level result. Updated on every snapshot; UI subscribes with selectors.
import type { Desk, Folder, LevelEndMessage, SnapshotMessage, Station } from '@redakcja/shared';
import { create } from 'zustand';

export type GameStore = {
  tick: number;
  elapsedMs: number;
  timeLeftMs: number;
  score: number;
  credibility: number;
  folders: readonly Folder[];
  stations: readonly Station[];
  desks: readonly Desk[];
  /** The level's one deadline extension has been used. */
  deadlineExtensionUsed: boolean;
  /** Set when the level ends; cleared when a new level starts. */
  levelEnd: LevelEndMessage | null;
  applySnapshot(snapshot: SnapshotMessage): void;
  setLevelEnd(message: LevelEndMessage): void;
  reset(): void;
};

const EMPTY = {
  tick: 0,
  elapsedMs: 0,
  timeLeftMs: 0,
  score: 0,
  credibility: 100,
  folders: [],
  stations: [],
  desks: [],
  deadlineExtensionUsed: false,
  levelEnd: null,
} satisfies Partial<GameStore>;

export const useGame = create<GameStore>((set) => ({
  ...EMPTY,
  applySnapshot(snapshot) {
    set({
      tick: snapshot.tick,
      elapsedMs: snapshot.elapsedMs,
      timeLeftMs: snapshot.timeLeftMs,
      score: snapshot.score,
      credibility: snapshot.credibility,
      folders: snapshot.folders,
      stations: snapshot.stations,
      desks: snapshot.desks,
      deadlineExtensionUsed: snapshot.deadlineExtensionUsed,
    });
  },
  setLevelEnd(message) {
    set({ levelEnd: message });
  },
  reset() {
    set(EMPTY);
  },
}));

// --- Selectors -----------------------------------------------------------------------------

/** The folder the given player carries, if any. */
export function selectCarried(state: GameStore, playerId: string | null): Folder | undefined {
  return playerId === null
    ? undefined
    : state.folders.find((f) => f.location.kind === 'carried' && f.location.playerId === playerId);
}

/** The station the given player operates, if any. */
export function selectOperatedStation(
  state: GameStore,
  playerId: string | null,
): Station | undefined {
  return playerId === null ? undefined : state.stations.find((s) => s.operatorId === playerId);
}

/** The desk the given player operates, if any. */
export function selectOperatedDesk(state: GameStore, playerId: string | null): Desk | undefined {
  return playerId === null ? undefined : state.desks.find((d) => d.operatorId === playerId);
}

/** The folder lying on a fixture, if any. */
export function selectFolderOn(state: GameStore, fixtureId: string): Folder | undefined {
  return state.folders.find(
    (f) => f.location.kind === 'fixture' && f.location.fixtureId === fixtureId,
  );
}
