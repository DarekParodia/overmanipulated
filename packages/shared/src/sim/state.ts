// Serialisable game state of one room. Only the simulation functions in this folder change it.
import { CREDIBILITY_START } from '../constants.ts';
import type { Role } from '../domain.ts';
import type { Desk, Folder, FolderResult, LevelOutcome, Station } from '../entities.ts';
import type { TileMap, Vec2 } from './map.ts';
import type { RngState } from './rng.ts';

export type PlayerState = {
  id: string;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  /** Sequence number of the last input applied; -1 before the first input. */
  lastInputSeq: number;
};

/** Per-player gameplay data that is not part of movement prediction. */
export type CrewMember = {
  role: Role | null;
  /** Whether the work button is held, as of the last input received. */
  workHeld: boolean;
  /** Level time of the last ping (for the cooldown); -Infinity before the first. */
  lastPingMs: number;
};

export type GameState = {
  tick: number;
  /** Level time since start, in ms. */
  elapsedMs: number;
  rng: RngState;
  /** Keyed by player id; insertion order is join order. */
  players: Record<string, PlayerState>;
  crew: Record<string, CrewMember>;
  /** Keyed by folder id (`f<n>`). */
  folders: Record<string, Folder>;
  nextFolderNumber: number;
  /** Index into the level schedule of the next folder to spawn. */
  nextSpawnIndex: number;
  /** Keyed by station fixture id. */
  stations: Record<string, Station>;
  /** Keyed by desk fixture id. */
  desks: Record<string, Desk>;
  score: number;
  credibility: number;
  /** The managing editor's one deadline extension per level. */
  deadlineExtensionUsed: boolean;
  /** Every resolved folder, for the level summary. */
  results: FolderResult[];
  /** Set once when the level is over; the server then sends `levelEnd`. */
  ended: LevelOutcome | null;
};

export type GameStateOptions = {
  /** Stations and desks are created from the map's fixtures. */
  map?: TileMap;
  seed?: number;
};

export function createGameState(options: GameStateOptions = {}): GameState {
  const stations: Record<string, Station> = {};
  const desks: Record<string, Desk> = {};
  for (const fixture of options.map?.fixtures ?? []) {
    if (fixture.kind === 'station' && fixture.station) {
      stations[fixture.id] = {
        id: fixture.id,
        kind: fixture.station,
        operatorId: null,
        phase: 'idle',
        progressMs: 0,
        durationMs: 0,
        minigameSeed: 0,
        lockoutMs: 0,
      };
    } else if (fixture.kind === 'desk') {
      desks[fixture.id] = { id: fixture.id, operatorId: null };
    }
  }
  return {
    tick: 0,
    elapsedMs: 0,
    rng: (options.seed ?? 1) | 0,
    players: {},
    crew: {},
    folders: {},
    nextFolderNumber: 1,
    nextSpawnIndex: 0,
    stations,
    desks,
    score: 0,
    credibility: CREDIBILITY_START,
    deadlineExtensionUsed: false,
    results: [],
    ended: null,
  };
}

export function spawnPoint(map: TileMap, slot: number): Vec2 {
  const spawn = map.spawns[slot % Math.max(map.spawns.length, 1)];
  if (!spawn) {
    throw new Error('Map has no spawn points');
  }
  return spawn;
}

export function addPlayer(
  state: GameState,
  id: string,
  at: Vec2,
  role: Role | null = null,
): GameState {
  const player: PlayerState = {
    id,
    x: at.x,
    y: at.y,
    facing: Math.PI / 2,
    moving: false,
    lastInputSeq: -1,
  };
  return {
    ...state,
    players: { ...state.players, [id]: player },
    crew: {
      ...state.crew,
      [id]: { role, workHeld: false, lastPingMs: Number.NEGATIVE_INFINITY },
    },
  };
}

/**
 * Removes a player. A folder they carried is dropped where they stood, and stations or desks
 * they operated are released, so nothing is left owned by a player who is gone.
 */
export function removePlayer(state: GameState, id: string): GameState {
  const { [id]: removed, ...players } = state.players;
  const { [id]: _crew, ...crew } = state.crew;
  const folders: Record<string, Folder> = {};
  for (const [folderId, folder] of Object.entries(state.folders)) {
    folders[folderId] =
      folder.location.kind === 'carried' && folder.location.playerId === id
        ? { ...folder, location: { kind: 'floor', x: removed?.x ?? 0, y: removed?.y ?? 0 } }
        : folder;
  }
  const stations: Record<string, Station> = {};
  for (const [stationId, station] of Object.entries(state.stations)) {
    stations[stationId] =
      station.operatorId === id
        ? { ...station, operatorId: null, phase: 'idle', progressMs: 0 }
        : station;
  }
  const desks: Record<string, Desk> = {};
  for (const [deskId, desk] of Object.entries(state.desks)) {
    desks[deskId] = desk.operatorId === id ? { ...desk, operatorId: null } : desk;
  }
  return { ...state, players, crew, folders, stations, desks };
}

// --- Queries used by several subsystems ----------------------------------------------------

/** The folder a player is carrying, if any. */
export function carriedFolder(state: GameState, playerId: string): Folder | undefined {
  return Object.values(state.folders).find(
    (f) => f.location.kind === 'carried' && f.location.playerId === playerId,
  );
}

/** The folder lying on a fixture (conveyor tile, table, station, desk), if any. */
export function folderOnFixture(state: GameState, fixtureId: string): Folder | undefined {
  return Object.values(state.folders).find(
    (f) => f.location.kind === 'fixture' && f.location.fixtureId === fixtureId,
  );
}

/** Level time left, never negative. */
export function timeLeftMs(state: GameState, durationS: number): number {
  return Math.max(0, durationS * 1000 - state.elapsedMs);
}
