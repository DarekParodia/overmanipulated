// Pure rules behind the client side of endless mode (S4-11): when the card unlocks, the tempo
// chip, time formatting and where a run sits on a leaderboard. No React, no I/O. The local best
// run lives in `store/progress.ts` next to the campaign stars.
import type { LeaderboardEntry } from '@redakcja/shared';
import {
  type CampaignLevel,
  type EndlessRun,
  levelNumber,
  type Progress,
} from '../store/progress.ts';

/** Endless mode opens once this campaign level has at least this many stars in this browser. */
export const ENDLESS_UNLOCK = { levelNumber: 1, stars: 1 } as const;

/** The HUD tempo chip grows by one step this often (display only; the generator speeds up). */
export const ENDLESS_TEMPO_STEP_MS = 60_000;

/** A finished run is looked for in the fetched list within this many seconds of survival. */
const SURVIVED_TOLERANCE_S = 1;

/** The level that must be beaten first, if the campaign has it. */
export function endlessGate(levels: readonly CampaignLevel[]): CampaignLevel | undefined {
  return levels.find((level) => levelNumber(level.id) === ENDLESS_UNLOCK.levelNumber);
}

export function endlessUnlocked(levels: readonly CampaignLevel[], progress: Progress): boolean {
  const gate = endlessGate(levels);
  return gate !== undefined && (progress[gate.id] ?? 0) >= ENDLESS_UNLOCK.stars;
}

/** „Tempo ×N”: 1 in the first minute, one more each minute after. */
export function tempoLevel(elapsedMs: number): number {
  return 1 + Math.floor(Math.max(0, elapsedMs) / ENDLESS_TEMPO_STEP_MS);
}

/** `m:ss` counting up (whole seconds, rounded down). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Survived time from the server (`survivedS`), else from the last clock the HUD saw. */
export function survivedSeconds(survivedS: number | undefined, fallbackElapsedMs: number): number {
  return Math.max(0, Math.floor(survivedS ?? fallbackElapsedMs / 1000));
}

export function formatSurvived(seconds: number): string {
  return formatElapsed(seconds * 1000);
}

/** Index of this crew's run in a fetched list (the newest match), or -1. */
export function findOwnRun(
  entries: readonly LeaderboardEntry[],
  run: EndlessRun & { roomCode: string },
): number {
  let found = -1;
  entries.forEach((entry, index) => {
    if (
      entry.roomCode === run.roomCode &&
      entry.score === run.score &&
      Math.abs(entry.survivedS - run.survivedS) <= SURVIVED_TOLERANCE_S &&
      (found < 0 || entry.createdAt > (entries[found]?.createdAt ?? 0))
    ) {
      found = index;
    }
  });
  return found;
}

/** Crew names for a leaderboard row. */
export function formatPlayers(players: readonly string[]): string {
  return players.join(', ');
}
