// Latest authoritative gameplay state besides player positions (those go through the snapshot
// buffer and prediction): folders, stations, desks, score, credibility, level timer, the next
// scheduled folder, the pause flag and the level result. Updated on every snapshot; UI subscribes with selectors.
import type {
  Desk,
  Folder,
  LevelEndMessage,
  NextFolder,
  SnapshotMessage,
  Station,
} from '@redakcja/shared';
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
  /** Level times of the next scheduled folder and the previous one; null when none is left. */
  nextFolder: NextFolder | null;
  /** A scheduled folder is due but waits for a free conveyor tile. */
  conveyorFull: boolean;
  /** The solo player's in-game menu holds the level still (S7-10). */
  paused: boolean;
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
  nextFolder: null,
  conveyorFull: false,
  paused: false,
  levelEnd: null,
} satisfies Partial<GameStore>;

/** Same level times: keep the old object, so selectors do not re-render 20 times a second. */
function stableNextFolder(previous: NextFolder | null, next: NextFolder | null): NextFolder | null {
  return previous && next && previous.atMs === next.atMs && previous.sinceMs === next.sinceMs
    ? previous
    : next;
}

export const useGame = create<GameStore>((set, get) => ({
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
      nextFolder: stableNextFolder(get().nextFolder, snapshot.nextFolder),
      conveyorFull: snapshot.conveyorFull,
      paused: snapshot.paused,
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
