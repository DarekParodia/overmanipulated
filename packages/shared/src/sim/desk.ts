// Editorial desk: opening the verdict sheet, verdict evaluation and justification (S2-07).
// Emits: deskOpened, deskClosed, verdictResult (with score/credibility deltas applied here).
// Consumes commands: verdict, cancel (when operating a desk), extendDeadline.
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

export function stepDesk(state: GameState, _frame: SimFrame): GameState {
  // TODO(S2-07): implement.
  return state;
}
