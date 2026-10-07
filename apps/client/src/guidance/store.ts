// Guidance state: whether "what next" hints are on (a player setting, persisted; on by default)
// and the current next step, published by the driver for the hint bubble and scene markers.
import { create } from 'zustand';
import { readStored, writeStored } from '../store/safe-storage.ts';
import { type NextStep, sameStep } from './next-step.ts';

const HINTS_KEY = 'redakcja.hints';

type GuidanceStore = {
  hintsEnabled: boolean;
  step: NextStep | null;
  setHintsEnabled(enabled: boolean): void;
  setStep(step: NextStep | null): void;
};

export const useGuidance = create<GuidanceStore>((set, get) => ({
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
