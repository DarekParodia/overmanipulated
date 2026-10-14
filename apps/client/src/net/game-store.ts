// Latest authoritative gameplay state besides player positions (those go through the snapshot
// buffer and prediction): folders, stations, desks, score, credibility, level timer, the next
// scheduled folder, the pause flag, the versus scoreboard and the level result. Updated on every
// snapshot; UI subscribes with selectors. `createGameStore` makes one per view: `useGame` is the
// player's own newsroom, the spectate store keeps one per team (S7-84).
import type {
  CrewSnapshot,
  Desk,
  Folder,
  LevelEndMessage,
  NextFolder,
  SnapshotMessage,
  Station,
  TeamScore,
} from '@redakcja/shared';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export type GameStore = {
  tick: number;
  elapsedMs: number;
  timeLeftMs: number;
  score: number;
  credibility: number;
  folders: readonly Folder[];
  stations: readonly Station[];
  desks: readonly Desk[];
  /** Every player's ability state (cooldown, armed, field call, rescues), in join order. */
  crew: readonly CrewSnapshot[];
  /** Level times of the next scheduled folder and the previous one; null when none is left. */
  nextFolder: NextFolder | null;
  /** A scheduled folder is due but waits for a free conveyor tile. */
  conveyorFull: boolean;
  /** The solo player's in-game menu holds the level still (S7-10). */
  paused: boolean;
  /** Versus only: both newsrooms' standings (the rival chip, S7-89); null in co-op. */
  scoreboard: readonly TeamScore[] | null;
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
  crew: [],
  nextFolder: null,
  conveyorFull: false,
  paused: false,
  scoreboard: null,
  levelEnd: null,
} satisfies Partial<GameStore>;

/** Same level times: keep the old object, so selectors do not re-render 20 times a second. */
function stableNextFolder(previous: NextFolder | null, next: NextFolder | null): NextFolder | null {
  return previous && next && previous.atMs === next.atMs && previous.sinceMs === next.sinceMs
    ? previous
    : next;
}

/** Same standings: keep the old array, so the rival chip re-renders only when a number moves. */
function stableScoreboard(
  previous: readonly TeamScore[] | null,
  next: readonly TeamScore[] | null,
): readonly TeamScore[] | null {
  if (!previous || !next || previous.length !== next.length) {
    return next;
  }
  const same = previous.every((team, i) => {
    const other = next[i];
    return (
      other !== undefined &&
      team.team === other.team &&
      team.score === other.score &&
      team.credibility === other.credibility &&
      team.resolved === other.resolved &&
      team.expired === other.expired &&
      team.connected === other.connected
    );
  });
  return same ? previous : next;
}

export type GameStoreApi = UseBoundStore<StoreApi<GameStore>>;

/** A fresh, empty game store for one view (the player's newsroom or one watched team). */
export function createGameStore(): GameStoreApi {
  return create<GameStore>((set, get) => ({
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
        crew: snapshot.crew,
        nextFolder: stableNextFolder(get().nextFolder, snapshot.nextFolder),
        conveyorFull: snapshot.conveyorFull,
        paused: snapshot.paused,
        scoreboard: stableScoreboard(get().scoreboard, snapshot.scoreboard ?? null),
      });
    },
    setLevelEnd(message) {
      set({ levelEnd: message });
    },
    reset() {
      set(EMPTY);
    },
  }));
}

/** The local player's newsroom. */
export const useGame = createGameStore();

// --- Selectors -----------------------------------------------------------------------------

/** The folder the given player carries, if any. */
export function selectCarried(state: GameStore, playerId: string | null): Folder | undefined {
  return playerId === null
    ? undefined
    : state.folders.find((f) => f.location.kind === 'carried' && f.location.playerId === playerId);
}

/** The given player's ability state, if they are in the crew. */
export function selectCrewMember(
  state: GameStore,
  playerId: string | null,
): CrewSnapshot | undefined {
  return playerId === null ? undefined : state.crew.find((m) => m.id === playerId);
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
