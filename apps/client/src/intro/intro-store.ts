// The intro's seen flag (S7-99): one per browser. Finishing the intro or skipping it sets the
// flag, so the lobby stops playing it on its own; the game starting mid-intro does not. Replays
// from „Jak grać?” and the settings ignore the flag. Blocked storage counts as not seen, so the
// worst case is one more autoplay, which „Pomiń” ends.
import { readStored, writeStored } from '../store/safe-storage.ts';

export const INTRO_SEEN_KEY = 'redakcja.intro.seen.v1';
const SEEN = '1';

export function introSeen(): boolean {
  return readStored('local', INTRO_SEEN_KEY) === SEEN;
}

/** After the last scene or „Pomiń”. */
export function markIntroSeen(): void {
  writeStored('local', INTRO_SEEN_KEY, SEEN);
}

/** Lets the lobby autoplay the intro again (tests, a future settings reset). */
export function resetIntroSeen(): void {
  writeStored('local', INTRO_SEEN_KEY, null);
}
