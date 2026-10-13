// Pure rules behind the station overlays' round handling and the role abilities offered in them
// (S7-41): which minigame round the overlay shows, when the lockout plate shows, and when the
// overlay offers Ekspertyza or the plate offers Druga szansa. Kept free of React for unit tests.
import type { Ability, AbilityPreview } from '@redakcja/shared';

/**
 * One minigame round at a station. The nonce counts the local player's `minigameStarted`
 * events, so a round that repeats its seed (Druga szansa keeps the operator, the Kartoteka keeps
 * its card) still gets a fresh key and the overlay opens again.
 */
export function roundKey(stationId: string, seed: number, nonce: number): string {
  return `${stationId}:${seed}:${nonce}`;
}

/** The station the local player operates, as far as the overlay cares. */
export type RoundStation = { id: string; phase: string; minigameSeed: number };

/**
 * The local player's `minigameStarted` events: how many so far (the round nonce) and the station
 * and seed of the latest one while its round may still be on (null once the station left the
 * minigame).
 */
export type LocalStarts = { count: number; last: { stationId: string; seed: number } | null };

export const NO_STARTS: LocalStarts = { count: 0, last: null };

/** Counts one more local start. */
export function countStart(starts: LocalStarts, stationId: string, seed: number): LocalStarts {
  return { count: starts.count + 1, last: { stationId, seed } };
}

/**
 * The key of the round the overlay shows, or null when it shows none: the station is in its
 * minigame, not down, and the player has not finished or left this round yet. While the latest
 * start names this station with another seed, the snapshot still shows the round before (the
 * server sends a tick's events first): nothing shows until it catches up, so the old card never
 * flashes up and the overlay mounts once.
 */
export function shownRound(
  station: RoundStation | undefined,
  starts: LocalStarts,
  settledRound: string | null,
  down: boolean,
): string | null {
  if (station?.phase !== 'minigame' || down) {
    return null;
  }
  if (starts.last?.stationId === station.id && starts.last.seed !== station.minigameSeed) {
    return null;
  }
  const key = roundKey(station.id, station.minigameSeed, starts.count);
  return key === settledRound ? null : key;
}

/**
 * When the lockout plate hides, as `performance.now()` time: a failure's `lockoutMs` from the
 * server (0 after Druga szansa hides the plate at once).
 */
export function lockoutUntil(lockoutMs: number, now: number): number {
  return lockoutMs > 0 ? now + lockoutMs : 0;
}

/** The local ability as the overlays read it (`abilities/use-ability.ts`). */
export type OverlayAbility = { ability: Ability | null; preview: AbilityPreview };

/**
 * A local failure needs no lockout estimate when Druga szansa is armed: the server reopens the
 * minigame at once instead of locking the station.
 */
export function failureReopens(local: OverlayAbility): boolean {
  return local.ability === 'secondChance' && local.preview.kind === 'armed';
}

/** Ekspertyza would solve the minigame at this station right now. */
export function expertiseOffered(local: OverlayAbility, stationId: string): boolean {
  return (
    local.ability === 'expertise' &&
    local.preview.kind === 'now' &&
    local.preview.stationId === stationId
  );
}

/**
 * The lockout plate's Druga szansa line: the press would reopen the locked station now. It is a
 * hint, so it hides with the effective hints off (the setting, or Ekspert difficulty).
 */
export function secondChanceOffered(
  local: OverlayAbility,
  lockedStationId: string | null,
  hintsOn: boolean,
): boolean {
  return (
    hintsOn &&
    lockedStationId !== null &&
    local.ability === 'secondChance' &&
    local.preview.kind === 'now' &&
    local.preview.stationId === lockedStationId
  );
}
