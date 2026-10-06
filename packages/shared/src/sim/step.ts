// One simulation tick. Pure: (state, inputs, commands, context) → new state + events.
import type { GameEvent, InputMessage } from '../protocol.ts';
import { stepDesk } from './desk.ts';
import { stepFolders } from './folders.ts';
import type { PlayerIntent, QueuedCommand, SimContext, SimFrame, Subsystem } from './frame.ts';
import type { TileMap } from './map.ts';
import { facingFor, isMoving, moveBody } from './movement.ts';
import { stepPings } from './pings.ts';
import { stepScoring } from './scoring.ts';
import type { CrewMember, GameState, PlayerState } from './state.ts';
import { stepStations } from './stations.ts';

/** The part of an input message the simulation consumes. */
export type PlayerInput = Pick<InputMessage, 'seq' | 'move' | 'actions'>;

/**
 * Gameplay subsystems in the order they run each tick, after movement. Folders first (so a
 * folder put on a station this tick can be worked on), scoring last (it reads the tick's events).
 */
const SUBSYSTEMS: readonly Subsystem[] = [
  stepFolders,
  stepStations,
  stepDesk,
  stepPings,
  stepScoring,
];

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

export type StepResult = { state: GameState; events: GameEvent[] };

/**
 * Advances the game by one tick. `inputs` holds, per player, the inputs to apply this tick in
 * order (usually one; more when the server catches up a lagging queue; none when it is empty).
 * `commands` are the player decisions received since the last tick. Once the level has ended
 * the state no longer changes.
 */
export function step(
  state: GameState,
  inputs: Readonly<Record<string, readonly PlayerInput[]>>,
  commands: readonly QueuedCommand[],
  ctx: SimContext,
): StepResult {
  if (state.ended) {
    return { state, events: [] };
  }
  const players: Record<string, PlayerState> = {};
  const crew: Record<string, CrewMember> = { ...state.crew };
  const intents: Record<string, PlayerIntent> = {};
  for (const [id, player] of Object.entries(state.players)) {
    const queue = inputs[id] ?? [];
    let next = queue.length === 0 ? { ...player, moving: false } : player;
    for (const input of queue) {
      next = applyPlayerInput(next, input, ctx.dtMs, ctx.map);
    }
    players[id] = next;
    const member = crew[id];
    const last = queue[queue.length - 1];
    const workHeld = last ? last.actions.work : (member?.workHeld ?? false);
    if (member && member.workHeld !== workHeld) {
      crew[id] = { ...member, workHeld };
    }
    intents[id] = {
      interact: queue.some((input) => input.actions.interact),
      work: workHeld,
      moving: queue.some((input) => isMoving(input.move)),
    };
  }

  const frame: SimFrame = { ctx, intents, commands, events: [] };
  let next: GameState = {
    ...state,
    tick: state.tick + 1,
    elapsedMs: state.elapsedMs + ctx.dtMs,
    players,
    crew,
  };
  for (const subsystem of SUBSYSTEMS) {
    next = subsystem(next, frame);
  }
  return { state: next, events: frame.events };
}
