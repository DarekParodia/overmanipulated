// Scoring outside the desk: expiry penalties, credibility bounds, level timer, stars and the
// level end (S2-08). Reads this tick's events (e.g. folderExpired) from `frame.events`.
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

export function stepScoring(state: GameState, _frame: SimFrame): GameState {
  // TODO(S2-08): implement.
  return state;
}
