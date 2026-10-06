// What every gameplay subsystem receives for one tick, besides the state.
import type { GameEvent, PlayerCommand } from '../protocol.ts';
import type { SimLevel, StoryBook } from './content.ts';
import type { TileMap } from './map.ts';
import type { GameState } from './state.ts';

/** Fixed inputs of a level run. */
export type SimContext = {
  dtMs: number;
  map: TileMap;
  level: SimLevel;
  stories: StoryBook;
};

/** One player's intent this tick, condensed from the inputs applied this tick. */
export type PlayerIntent = {
  /** The pick-up/put-down button was pressed (edge) in any input this tick. */
  interact: boolean;
  /** The work button is held (last known state; kept while no input arrived). */
  work: boolean;
  /** The player tried to move this tick. */
  moving: boolean;
};

/** A command with the id of the player who sent it. */
export type QueuedCommand = { playerId: string; command: PlayerCommand };

export type SimFrame = {
  ctx: SimContext;
  /** Keyed by player id; every player in the state has an entry. */
  intents: Readonly<Record<string, PlayerIntent>>;
  /** Commands received since the last tick, in arrival order. */
  commands: readonly QueuedCommand[];
  /** Append-only: subsystems push the events they cause; the server broadcasts them. */
  events: GameEvent[];
};

/** Signature shared by all gameplay subsystems (folders, stations, desk, scoring, pings). */
export type Subsystem = (state: GameState, frame: SimFrame) => GameState;
