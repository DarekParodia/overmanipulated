// Message of the day (S7-72): which operator message the main menu shows. Pure; the banner keeps
// the dismissed id in localStorage through store/safe-storage.ts.
import type { Motd } from '@redakcja/shared';

/** localStorage key of the last dismissed message id (one id: a new message replaces it). */
export const MOTD_DISMISSED_KEY = 'redakcja.motd.dismissed';

/** The message to show: none without one, and none once the player closed this very id. */
export function visibleMotd(motd: Motd | null, dismissedId: string | null): Motd | null {
  if (motd === null || motd.id === dismissedId) {
    return null;
  }
  return motd;
}
