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
  // An ability hint can show at a locked station: lifted above its lockout plate too.
  if (kind === 'working' || kind === 'lockout' || kind === 'ability') {
    return 'prompt';
  }
  return 'free';
}
