// Deadline ticking: while any warned folder is still in play, a clock ticks, faster as the most
// urgent deadline nears; it stops when that folder is resolved (verdict or expiry removes it).
import { DEADLINE_WARNING_MS, type Folder } from '@redakcja/shared';

/** Tick spacing at the moment of the warning and right at the deadline. */
export const TICK_SLOW_MS = 800;
export const TICK_FAST_MS = 220;

/**
 * Time left on the most urgent warned folder, or null when nothing needs ticking. A folder whose
 * deadline was extended past the warning window stops ticking even though `warned` stays set.
 */
export function urgentTimeLeft(folders: readonly Folder[], elapsedMs: number): number | null {
  let best: number | null = null;
  for (const folder of folders) {
    if (!folder.warned) {
      continue;
    }
    const left = folder.deadlineMs - elapsedMs;
    if (left > 0 && left <= DEADLINE_WARNING_MS && (best === null || left < best)) {
      best = left;
    }
  }
  return best;
}

/** Interval until the next tick: slow at the warning, fast at the deadline. */
export function tickIntervalMs(timeLeftMs: number): number {
  const t = Math.min(1, Math.max(0, timeLeftMs / DEADLINE_WARNING_MS));
  return Math.round(TICK_FAST_MS + (TICK_SLOW_MS - TICK_FAST_MS) * t);
}
