// Pure model of the caption stack: which chips are visible and when they expire. No React, no
// clock reads (time is passed in), so it is unit-tested directly.
import { type CaptionChip, DEFAULT_CAPTION_MS } from './captions.ts';

/** More chips than this would crowd the scene; the oldest is dropped first. */
export const MAX_VISIBLE_CAPTIONS = 3;

export type Caption = CaptionChip & {
  /** Unique per chip, stable while a group keeps refreshing it. */
  id: number;
  group: string | undefined;
  expiresAt: number;
  /** Bumped on every refresh so the view can restart the chip's pop animation. */
  rev: number;
};

export type CaptionInput = CaptionChip & { group?: string | undefined; ttlMs?: number | undefined };

export type CaptionState = { chips: readonly Caption[]; nextId: number };

export const emptyCaptions: CaptionState = { chips: [], nextId: 1 };

/**
 * Adds a chip. A chip of the same group, or with the same words, is refreshed in place instead
 * of piling up (deadline ticks arrive several times a second).
 */
export function pushCaption(state: CaptionState, input: CaptionInput, now: number): CaptionState {
  const expiresAt = now + (input.ttlMs ?? DEFAULT_CAPTION_MS);
  const same = state.chips.find(
    (chip) =>
      (input.group !== undefined && chip.group === input.group) ||
      (chip.text === input.text && chip.icon === input.icon),
  );
  if (same) {
    const refreshed: Caption = {
      id: same.id,
      icon: input.icon,
      text: input.text,
      tone: input.tone,
      group: input.group,
      expiresAt,
      // A refresh that changes nothing visible must not retrigger the pop.
      rev: same.text === input.text && same.tone === input.tone ? same.rev : same.rev + 1,
    };
    return {
      ...state,
      chips: state.chips.map((chip) => (chip.id === same.id ? refreshed : chip)),
    };
  }
  const added: Caption = {
    id: state.nextId,
    icon: input.icon,
    text: input.text,
    tone: input.tone,
    group: input.group,
    expiresAt,
    rev: 0,
  };
  const chips = [...state.chips, added].slice(-MAX_VISIBLE_CAPTIONS);
  return { chips, nextId: state.nextId + 1 };
}

/** Drops expired chips. Returns the same state object when nothing expired. */
export function pruneCaptions(state: CaptionState, now: number): CaptionState {
  const chips = state.chips.filter((chip) => chip.expiresAt > now);
  return chips.length === state.chips.length ? state : { ...state, chips };
}

/** When the next chip expires, or null when the stack is empty. */
export function nextExpiry(state: CaptionState): number | null {
  let soonest: number | null = null;
  for (const chip of state.chips) {
    if (soonest === null || chip.expiresAt < soonest) {
      soonest = chip.expiresAt;
    }
  }
  return soonest;
}
