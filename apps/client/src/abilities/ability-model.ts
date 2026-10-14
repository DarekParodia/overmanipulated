// What the HUD ability chip and the touch ability button show (S7-40), and whether a press is
// sent, both read from the shared ability preview (`abilityPreview`, S7-37/S7-38). Pure.
import {
  ABILITY,
  type Ability,
  type AbilityBlockReason,
  type AbilityPreview,
} from '@redakcja/shared';
import { pl } from '../strings/pl.ts';

/** `arm` and `now` both read as ready: one press does something. */
export type AbilityChipState = 'ready' | 'armed' | 'calling' | 'cooling' | 'blocked';

/** Whom or what a ready press would act on (the `now` preview's target). */
export type AbilityTarget = { folderId?: string; stationId?: string; playerId?: string };

export type AbilityChipModel = {
  ability: Ability;
  state: AbilityChipState;
  /** The ring's fill, 0..1: the cooldown or the call running down; 1 when ready or armed. */
  ring: number;
  /** Whole seconds left while cooling or calling; null otherwise. */
  seconds: number | null;
  /** The status in at most two words. */
  label: string;
  reason?: AbilityBlockReason;
  /** The `now` target; null for every other state. */
  target: AbilityTarget | null;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Seconds left, rounded up so the ring never reads 0 while it still runs. */
function secondsLeft(untilMs: number, elapsedMs: number): number {
  return Math.max(0, Math.ceil((untilMs - elapsedMs) / 1000));
}

/** The chip for a preview; null when the player has no ability. */
export function abilityChipModel(
  preview: AbilityPreview,
  ability: Ability | null,
  elapsedMs: number,
): AbilityChipModel | null {
  if (ability === null || preview.kind === 'none') {
    return null;
  }
  const labels = pl.hud.ability;
  switch (preview.kind) {
    case 'cooling': {
      const left = preview.readyAtMs - elapsedMs;
      const seconds = secondsLeft(preview.readyAtMs, elapsedMs);
      return {
        ability,
        state: 'cooling',
        ring: clamp01(1 - left / ABILITY[ability].cooldownMs),
        seconds,
        label: labels.cooling,
        target: null,
      };
    }
    case 'calling': {
      const left = preview.endsAtMs - elapsedMs;
      return {
        ability,
        state: 'calling',
        ring: clamp01(1 - left / ABILITY.fieldCall.callMs),
        seconds: secondsLeft(preview.endsAtMs, elapsedMs),
        label: labels.calling,
        target: { folderId: preview.folderId },
      };
    }
    case 'armed':
      return { ability, state: 'armed', ring: 1, seconds: null, label: labels.armed, target: null };
    case 'blocked':
      return {
        ability,
        state: 'blocked',
        ring: 0,
        seconds: null,
        label: labels.blocked[preview.reason],
        reason: preview.reason,
        target: null,
      };
    case 'arm':
      return { ability, state: 'ready', ring: 1, seconds: null, label: labels.ready, target: null };
    case 'now': {
      const target: AbilityTarget = {};
      if (preview.folderId !== undefined) target.folderId = preview.folderId;
      if (preview.stationId !== undefined) target.stationId = preview.stationId;
      if (preview.targetPlayerId !== undefined) target.playerId = preview.targetPlayerId;
      return { ability, state: 'ready', ring: 1, seconds: null, label: labels.ready, target };
    }
  }
}

export type AbilityPress = 'send' | 'denied';

/**
 * What one press does on this client: the server is told only when the preview says the press
 * does something there (act now, arm, disarm). With no ability, while cooling, when blocked and
 * during a field call (the simulation ignores those presses) it stays here and plays the
 * `ability.denied` cue.
 */
export function abilityPressOutcome(preview: AbilityPreview): AbilityPress {
  switch (preview.kind) {
    case 'none':
    case 'cooling':
    case 'blocked':
    case 'calling':
      return 'denied';
    case 'armed':
    case 'arm':
    case 'now':
      return 'send';
  }
}

/** The folder the local player's ready press would act on, for its queue card's outline. */
export function abilityTargetFolder(model: AbilityChipModel | null): string | null {
  return model?.state === 'ready' ? (model.target?.folderId ?? null) : null;
}

/** How the chip names a ready press's target: a teammate's nickname or a station's sign. */
export type TargetNames = {
  player(playerId: string): string | undefined;
  station(stationId: string): string | undefined;
};

/**
 * The word the chip shows for a ready press with a person or a station to act on (Podaj teczkę's
 * receiver, Ekspertyza's or Druga szansa's station); null when the target is only a folder,
 * which its queue card outlines instead.
 */
export function abilityTargetName(
  model: AbilityChipModel | null,
  names: TargetNames,
): string | null {
  const target = model?.state === 'ready' ? model.target : null;
  if (target?.playerId !== undefined) {
    return names.player(target.playerId) ?? null;
  }
  if (target?.stationId !== undefined) {
    return names.station(target.stationId) ?? null;
  }
  return null;
}

/** The chip's or the button's accessible name: the ability, its status and any seconds left. */
export function abilityAriaLabel(model: AbilityChipModel, status: string): string {
  const name = pl.vocab.abilities[model.ability];
  return model.seconds === null
    ? pl.hud.ability.label(name, status)
    : pl.hud.ability.labelSeconds(name, status, model.seconds);
}
