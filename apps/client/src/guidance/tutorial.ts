// First-game tutorial model: five steps, each completed by something the player really does in
// the game. Pure, so the progression is unit-tested; the store and the card live elsewhere.
import type { GameplayEvent } from '../fx/event-cues.ts';

export const TUTORIAL_STEPS = ['move', 'pickup', 'work', 'minigame', 'verdict'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/** Index past the last step: the tutorial is finished. */
export const TUTORIAL_DONE = TUTORIAL_STEPS.length;

/** Things that complete a step. */
export type TutorialSignal = 'moved' | 'pickedUp' | 'minigameStarted' | 'stampApplied' | 'verdict';

const COMPLETES: Record<TutorialSignal, TutorialStepId> = {
  moved: 'move',
  pickedUp: 'pickup',
  minigameStarted: 'work',
  stampApplied: 'minigame',
  verdict: 'verdict',
};

/**
 * The step after `signal`. A signal completes its step and every step before it (a player who
 * already knows the game can skip ahead); it never goes back.
 */
export function advanceTutorial(stepIndex: number, signal: TutorialSignal): number {
  const completed = TUTORIAL_STEPS.indexOf(COMPLETES[signal]);
  return Math.max(stepIndex, completed + 1);
}

/** The tutorial signal a gameplay event carries for the local player, if any. */
export function signalForEvent(
  event: GameplayEvent,
  localPlayerId: string | null,
): TutorialSignal | undefined {
  const mine = 'playerId' in event && event.playerId === localPlayerId;
  switch (event.kind) {
    case 'folderPickedUp':
      return mine ? 'pickedUp' : undefined;
    case 'minigameStarted':
      return mine ? 'minigameStarted' : undefined;
    case 'stampApplied':
      return mine ? 'stampApplied' : undefined;
    case 'verdictResult':
      // A verdict is a team outcome: whoever sends it, the whole round trip has been shown.
      return 'verdict';
    default:
      return undefined;
  }
}

/** The player counts as having moved once they are this far (tiles) from where they started. */
export const MOVED_DISTANCE = 0.6;
