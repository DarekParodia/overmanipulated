// The intro's seen flag (S7-99): one per browser. Finishing the intro or skipping it sets the
// flag, so the lobby stops playing it on its own; the game starting mid-intro does not. Replays
// from „Jak grać?” and the settings ignore the flag. Blocked storage counts as not seen, so the
// worst case is one more autoplay, which „Pomiń” ends. The lobby's autoplay rule lives here too
// (S7-102), so the menu bundle takes this tiny module and not the intro's timeline.
import type { ScreenId } from '../store/app.ts';
import { levelNumber } from '../store/progress.ts';
import { readStored, writeStored } from '../store/safe-storage.ts';

export const INTRO_SEEN_KEY = 'redakcja.intro.seen.v1';
const SEEN = '1';

export function introSeen(): boolean {
  return readStored('local', INTRO_SEEN_KEY) === SEEN;
}

/** After the last scene, „Pomiń”, or „Gotowe” closing a running intro. */
export function markIntroSeen(): void {
  writeStored('local', INTRO_SEEN_KEY, SEEN);
}

/** Lets the lobby autoplay the intro again (tests, a future settings reset). */
export function resetIntroSeen(): void {
  writeStored('local', INTRO_SEEN_KEY, null);
}

export type AutoplayInput = {
  screen: ScreenId;
  levelId: string;
  /** This browser has finished or skipped the intro before (`introSeen`). */
  seen: boolean;
  spectator: boolean;
  /** The intro (or the dialog holding it) is already open. */
  open: boolean;
};

/** The lobby plays the intro once per browser, on the training level, for players only. */
export function shouldAutoplayIntro(input: AutoplayInput): boolean {
  return (
    input.screen === 'lobby' &&
    levelNumber(input.levelId) === 0 &&
    !input.seen &&
    !input.spectator &&
    !input.open
  );
}
