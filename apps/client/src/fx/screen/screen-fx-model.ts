// Pure model behind the screen-space touches (ScreenFx.tsx): how strong each effect is for the
// current game state. No React, no stores, so it is unit-tested directly.
import { CREDIBILITY_LOW, DEADLINE_WARNING_MS, type Folder } from '@redakcja/shared';

/** The vignette is visible at least this strongly once credibility drops below the threshold. */
export const VIGNETTE_MIN_LEVEL = 0.25;
/** Below this many ms left the deadline pulse speeds up. */
export const PRESSURE_FAST_MS = 5_000;

/**
 * Red vignette strength 0..1: nothing at or above the "low credibility" threshold (30 %), a clear
 * frame right below it, full strength at 0. Credibility is on a 0..100 scale.
 */
export function vignetteLevel(credibility: number): number {
  if (credibility >= CREDIBILITY_LOW) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, (CREDIBILITY_LOW - credibility) / CREDIBILITY_LOW));
  return VIGNETTE_MIN_LEVEL + (1 - VIGNETTE_MIN_LEVEL) * t;
}

/** A bot raid is on while any folder carries a `botRaid` tag. */
export function isRaidActive(folders: readonly Folder[]): boolean {
  return folders.some((folder) => folder.tag?.kind === 'botRaid');
}

/** 0 = calm, 1 = a folder is under 10 s from its deadline, 2 = under 5 s. */
export type PressureTier = 0 | 1 | 2;

export function pressureTier(folders: readonly Folder[], elapsedMs: number): PressureTier {
  let tier: PressureTier = 0;
  for (const folder of folders) {
    const left = folder.deadlineMs - elapsedMs;
    if (left <= 0 || left >= DEADLINE_WARNING_MS) {
      continue;
    }
    if (left < PRESSURE_FAST_MS) {
      return 2;
    }
    tier = 1;
  }
  return tier;
}

/** How the effects move: everything is still with reduced motion or no-flash. */
export function effectsAnimated(settings: { reducedMotion: boolean; noFlash: boolean }): boolean {
  return !settings.reducedMotion && !settings.noFlash;
}

/** The glitch is the costly effect (many animated layers): it only moves above the low preset. */
export function glitchAnimated(
  settings: { reducedMotion: boolean; noFlash: boolean },
  preset: 'low' | 'medium' | 'high',
): boolean {
  return effectsAnimated(settings) && preset !== 'low';
}
