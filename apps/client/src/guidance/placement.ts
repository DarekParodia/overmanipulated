import type { NextStepKind } from './next-step.ts';

/**
 * Where guidance sits: free (bottom centre), making room for a station/desk overlay (left half
 * on wide screens, hidden on phones), or lifted above the work prompt at the bottom centre.
 */
export type GuidancePlacement = 'free' | 'overlay' | 'prompt';

export function placementFor(kind: NextStepKind | undefined): GuidancePlacement {
  if (kind === 'minigame' || kind === 'verdict') {
    return 'overlay';
  }
  if (kind === 'working' || kind === 'lockout') {
    return 'prompt';
  }
  return 'free';
}
