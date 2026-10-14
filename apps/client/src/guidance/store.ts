// Guidance state: whether "what next" hints are on (a player setting, persisted; on by default)
// and the current next step, published by the driver for the hint bubble and scene markers.
// What the game shows follows the effective hints (S7-24): the setting AND the room's difficulty
// (`DIFFICULTY[d].hints`), so Ekspert plays without the bubble, the scene markers and the
// folder-card proof count, whatever the setting says. The first-game tutorial is unaffected.
// Each GameView (net/game-view.ts) holds a guidance store: `useGuidance` is the player view's;
// a spectator view gets a disabled stub (no hints, no step) (S7-85).
import { DIFFICULTY, type Difficulty } from '@redakcja/shared';
import { create } from 'zustand';
import { useApp } from '../store/app.ts';
import { readStored, writeStored } from '../store/safe-storage.ts';
import { type NextStep, sameStep } from './next-step.ts';

const HINTS_KEY = 'redakcja.hints';

type GuidanceStore = {
  hintsEnabled: boolean;
  step: NextStep | null;
  setHintsEnabled(enabled: boolean): void;
  setStep(step: NextStep | null): void;
};

/** The player's guidance: the hints setting persists in local storage. */
function createPlayerGuidance() {
  return create<GuidanceStore>((set, get) => ({
    hintsEnabled: readStored('local', HINTS_KEY) !== 'off',
    step: null,
    setHintsEnabled(enabled) {
      set({ hintsEnabled: enabled });
      writeStored('local', HINTS_KEY, enabled ? null : 'off');
    },
    setStep(step) {
      if (!sameStep(get().step, step)) {
        set({ step });
      }
    },
  }));
}

export type GuidanceStoreApi = ReturnType<typeof createPlayerGuidance>;

/** Guidance for a view nobody plays in (a spectator): hints off, no step, setters ignored. */
export function createDisabledGuidance(): GuidanceStoreApi {
  return create<GuidanceStore>(() => ({
    hintsEnabled: false,
    step: null,
    setHintsEnabled: () => undefined,
    setStep: () => undefined,
  }));
}

/** The player view's guidance. */
export const useGuidance: GuidanceStoreApi = createPlayerGuidance();

/** Hints are shown when the player wants them and the difficulty allows them. */
export function effectiveHints(hintsEnabled: boolean, difficulty: Difficulty): boolean {
  return hintsEnabled && DIFFICULTY[difficulty].hints;
}

/** The effective hints flag, reactive to the setting and the room's difficulty. */
export function useEffectiveHints(): boolean {
  const enabled = useGuidance((s) => s.hintsEnabled);
  const difficulty = useApp((s) => s.difficulty);
  return effectiveHints(enabled, difficulty);
}

/** The effective hints flag of a guidance store right now, for per-frame readers. */
export function effectiveHintsOf(guidance: GuidanceStoreApi): boolean {
  return effectiveHints(guidance.getState().hintsEnabled, useApp.getState().difficulty);
}

/** The player's effective hints flag right now, for per-frame readers outside React renders. */
export function effectiveHintsNow(): boolean {
  return effectiveHintsOf(useGuidance);
}
