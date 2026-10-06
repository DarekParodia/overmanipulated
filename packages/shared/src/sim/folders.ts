// Folders: spawning from the level schedule, pick up / put down, deadlines and expiry (S2-02).
// Emits: folderSpawned, folderPickedUp, folderPutDown, deadlineWarning, folderExpired.
// Expired folders are removed here; their score and credibility are applied in scoring.ts.
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

export function stepFolders(state: GameState, _frame: SimFrame): GameState {
  // TODO(S2-02): implement.
  return state;
}
