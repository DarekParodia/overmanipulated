// Pure music-intensity model (S2-13): how hard the "pressure" layer should push, derived from
// the latest game state. Kept free of Howler and the DOM so it is unit-testable.
import { DEADLINE_WARNING_MS } from '@redakcja/shared';

/** Music tuning. Client-only feel numbers, not game balance. */
export const MUSIC_TUNING = {
  /** Remaining level time below which the time pressure starts to rise (linearly to 1 at 0). */
  timePressureFromMs: 60_000,
  /** Intensity added by each urgent folder (combined, capped at 1). */
  perUrgentFolder: 0.4,
  /** Slew limits for the intensity, in units per second (rises faster than it falls). */
  intensityUpPerS: 0.4,
  intensityDownPerS: 0.15,
  /** Remaining level time below which the tempo goes up. */
  tempoUpFromMs: 30_000,
  /** Playback rate in the last seconds (also raises pitch slightly, about one semitone). */
  tempoUpRate: 1.06,
  /** Playback-rate slew limit per second (1.0 → 1.06 in 3 s). */
  ratePerS: 0.02,
  /** Scene cross-fade speed (menu ↔ game), gain units per second. */
  fadePerS: 0.7,
} as const;

export type MusicGameState = {
  /** 0 until the first snapshot of a level arrives. */
  tick: number;
  elapsedMs: number;
  timeLeftMs: number;
  folders: readonly { deadlineMs: number }[];
  levelEnd: unknown;
};

/** Folders whose deadline is closer than the warning threshold. */
export function urgentFolderCount(folders: MusicGameState['folders'], elapsedMs: number): number {
  let count = 0;
  for (const folder of folders) {
    if (folder.deadlineMs - elapsedMs < DEADLINE_WARNING_MS) {
      count++;
    }
  }
  return count;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Target intensity in [0, 1]: rises over the last minute and with every urgent folder. */
export function targetIntensity(state: MusicGameState): number {
  if (state.tick === 0 || state.levelEnd) {
    return 0;
  }
  const time = clamp01(1 - state.timeLeftMs / MUSIC_TUNING.timePressureFromMs);
  const urgent = clamp01(
    urgentFolderCount(state.folders, state.elapsedMs) * MUSIC_TUNING.perUrgentFolder,
  );
  return 1 - (1 - time) * (1 - urgent);
}

/** Target playback rate: tempo up in the last seconds of a running level. */
export function targetRate(state: MusicGameState): number {
  if (state.tick === 0 || state.levelEnd || state.timeLeftMs > MUSIC_TUNING.tempoUpFromMs) {
    return 1;
  }
  return MUSIC_TUNING.tempoUpRate;
}

/** Moves `current` towards `target`, limited to the given rates (units per second). */
export function slew(
  current: number,
  target: number,
  upPerS: number,
  downPerS: number,
  dtS: number,
): number {
  if (target > current) {
    return Math.min(target, current + upPerS * dtS);
  }
  return Math.max(target, current - downPerS * dtS);
}
