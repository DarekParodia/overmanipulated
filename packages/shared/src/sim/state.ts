// Serialisable game state of one room. Only the simulation functions in this folder change it.
import type { TileMap, Vec2 } from './map.ts';

export type PlayerState = {
  id: string;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  /** Sequence number of the last input applied; -1 before the first input. */
  lastInputSeq: number;
};

export type GameState = {
  tick: number;
  /** Keyed by player id; insertion order is join order. */
  players: Record<string, PlayerState>;
};

export function createGameState(): GameState {
  return { tick: 0, players: {} };
}

export function spawnPoint(map: TileMap, slot: number): Vec2 {
  const spawn = map.spawns[slot % Math.max(map.spawns.length, 1)];
  if (!spawn) {
    throw new Error('Map has no spawn points');
  }
  return spawn;
}

export function addPlayer(state: GameState, id: string, at: Vec2): GameState {
  const player: PlayerState = {
    id,
    x: at.x,
    y: at.y,
    facing: Math.PI / 2,
    moving: false,
    lastInputSeq: -1,
  };
  return { ...state, players: { ...state.players, [id]: player } };
}

export function removePlayer(state: GameState, id: string): GameState {
  const { [id]: _removed, ...players } = state.players;
  return { ...state, players };
}
