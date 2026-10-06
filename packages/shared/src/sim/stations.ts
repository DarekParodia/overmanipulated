// Verification stations: occupancy, hold-to-work, minigame round, stamps, lockout (S2-03).
// Emits: workStarted, workCancelled, minigameStarted, minigameFailed, stampApplied.
// Consumes commands: minigameResult, cancel (when operating a station).
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

export function stepStations(state: GameState, _frame: SimFrame): GameState {
  // TODO(S2-03): implement.
  return state;
}
