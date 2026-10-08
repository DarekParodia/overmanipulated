// First-game tutorial model: five steps, each completed by something the player really does in
// the game. Pure, so the progression is unit-tested; the store and the card live elsewhere.
import type { GameplayEvent } from '../fx/event-cues.ts';

export const TUTORIAL_STEPS = ['move', 'pickup', 'work', 'minigame', 'verdict'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/** Index past the last step: the tutorial is finished. */
export const TUTORIAL_DONE = TUTORIAL_STEPS.length;

/** Things that complete a step. */
export type TutorialSignal =
  | 'moved'
  | 'pickedUp'
  | 'minigameStarted'
  | 'stampApplied'
  | 'verdict'
  /** A teammate's verdict: finishes only the last step, never skips the earlier ones. */
  | 'teamVerdict';

const COMPLETES: Record<TutorialSignal, TutorialStepId> = {
  moved: 'move',
  pickedUp: 'pickup',
  minigameStarted: 'work',
  stampApplied: 'minigame',
  verdict: 'verdict',
  teamVerdict: 'verdict',
};

/**
 * The step after `signal`. A signal completes its step and every step before it (a player who
 * already knows the game can skip ahead); it never goes back.
 */
export function advanceTutorial(stepIndex: number, signal: TutorialSignal): number {
  if (signal === 'teamVerdict' && stepIndex < TUTORIAL_STEPS.indexOf('verdict')) {
    return stepIndex;
  }
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
      // A verdict is a team outcome, but a teammate's one only counts on the last step.
      return mine ? 'verdict' : 'teamVerdict';
    default:
      return undefined;
  }
}

/** The player counts as having moved once they are this far (tiles) from where they started. */
export const MOVED_DISTANCE = 0.6;

// --- Skipping with a gamepad ---------------------------------------------------------------
// The card takes no input (the game runs underneath), so a pad player skips it with buttons
// the game does not use: press B twice quickly, or hold Back/Select.

/** Standard-mapping buttons that skip the tutorial. */
export const PAD_SKIP_BUTTONS = { east: 1, select: 8 } as const;
/** Two B presses this close together skip. */
export const PAD_SKIP_DOUBLE_MS = 600;
/** Holding Back/Select this long skips. */
export const PAD_SKIP_HOLD_MS = 700;
/** B presses this soon after an overlay let go of the pad are its "back" mashing: ignored. */
export const PAD_SKIP_QUIET_MS = 1000;

export type PadSkipState = {
  eastDown: boolean;
  selectDown: boolean;
  /** When the last B press (not followed by a second one) happened. */
  lastEastAt: number | null;
  /** When the current Back/Select hold started. */
  selectSince: number | null;
  /** Last poll during which an overlay owned the pad. */
  capturedAt: number | null;
};

/** Buttons already held when the card appears must be released before they count. */
export const PAD_SKIP_START: PadSkipState = {
  eastDown: true,
  selectDown: true,
  lastEastAt: null,
  selectSince: null,
  capturedAt: null,
};

export type PadSkipInput = {
  east: boolean;
  select: boolean;
  /** An overlay owns the pad (B means "back" there), so presses do not count. */
  captured: boolean;
};

/** One gamepad poll: the next state and whether the tutorial should be skipped now. */
export function padSkipStep(
  state: PadSkipState,
  input: PadSkipInput,
  nowMs: number,
): { state: PadSkipState; skip: boolean } {
  let { lastEastAt, selectSince, capturedAt } = state;
  let skip = false;
  if (input.captured) {
    capturedAt = nowMs;
  }
  const quiet = capturedAt === null || nowMs - capturedAt >= PAD_SKIP_QUIET_MS;

  const eastPressed = input.east && !state.eastDown;
  if (!quiet) {
    lastEastAt = null;
  } else if (eastPressed) {
    if (lastEastAt !== null && nowMs - lastEastAt <= PAD_SKIP_DOUBLE_MS) {
      skip = true;
      lastEastAt = null;
    } else {
      lastEastAt = nowMs;
    }
  }

  if (!input.select || input.captured) {
    selectSince = null;
  } else if (!state.selectDown) {
    selectSince = nowMs;
  }
  if (selectSince !== null && nowMs - selectSince >= PAD_SKIP_HOLD_MS) {
    skip = true;
    selectSince = null;
  }

  return {
    state: {
      eastDown: input.east,
      // A Select held through an overlay stays "down", so it must be released before it counts.
      selectDown: input.select,
      lastEastAt,
      selectSince,
      capturedAt,
    },
    skip,
  };
}
