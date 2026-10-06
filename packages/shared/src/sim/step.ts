// One simulation tick. Pure: (state, inputs, dt, map) → new state.
import type { InputMessage } from '../protocol.ts';
import type { TileMap } from './map.ts';
import { facingFor, isMoving, moveBody } from './movement.ts';
import type { GameState, PlayerState } from './state.ts';

/** The part of an input message the simulation consumes. */
export type PlayerInput = Pick<InputMessage, 'seq' | 'move' | 'actions'>;

/** Applies one input to one player for one tick. Used for both authority and prediction. */
export function applyPlayerInput(
  player: PlayerState,
  input: PlayerInput,
  dtMs: number,
  map: TileMap,
): PlayerState {
  const body = moveBody(player, input.move, dtMs, map);
  return {
    ...player,
    x: body.x,
    y: body.y,
    facing: facingFor(input.move, player.facing),
    moving: isMoving(input.move) && (body.x !== player.x || body.y !== player.y),
    lastInputSeq: input.seq,
  };
}

/**
 * Advances the game by one tick. `inputs` holds, per player, the inputs to apply this tick in
 * order (usually one; more when the server catches up a lagging queue; none when it is empty).
 */
export function step(
  state: GameState,
  inputs: Readonly<Record<string, readonly PlayerInput[]>>,
  dtMs: number,
  map: TileMap,
): GameState {
  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(state.players)) {
    const queue = inputs[id] ?? [];
    let next = queue.length === 0 ? { ...player, moving: false } : player;
    for (const input of queue) {
      next = applyPlayerInput(next, input, dtMs, map);
    }
    players[id] = next;
  }
  return { tick: state.tick + 1, players };
}
