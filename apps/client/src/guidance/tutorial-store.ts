// First-game tutorial state. Runs once per browser: finishing or skipping it sets a flag.
// The role ability step (S7-45) is skipped for a player without a role, and for one who already
// used the ability before reaching it.
import { create } from 'zustand';
import { readStored, writeStored } from '../store/safe-storage.ts';
import {
  advanceTutorial,
  skipAbilityStep,
  TUTORIAL_DONE,
  type TutorialSignal,
} from './tutorial.ts';

const DONE_KEY = 'redakcja.tutorial.done';

type TutorialStore = {
  /** Current step index; `TUTORIAL_DONE` shows the closing card; null when not running. */
  step: number | null;
  /** The local player has a role ability this level (the ability step is shown). */
  hasRole: boolean;
  /** The ability was used during this tutorial run, before its step came up. */
  abilityUsed: boolean;
  /**
   * Starts the tutorial unless this browser already finished or skipped it; `hasRole` says
   * whether the local player has a role ability this level.
   */
  start(hasRole: boolean): void;
  /**
   * Updates `hasRole` once the level is known (its stations decide whether the ability can act,
   * `abilityStepApplies`); a current ability step that no longer applies is skipped.
   */
  setHasRole(hasRole: boolean): void;
  signal(signal: TutorialSignal): void;
  skip(): void;
  /** Hides the closing card. */
  close(): void;
};

export function tutorialSeen(): boolean {
  return readStored('local', DONE_KEY) === '1';
}

/** Makes the tutorial run again at the start of the next game (settings button). */
export function resetTutorial(): void {
  writeStored('local', DONE_KEY, null);
}

export const useTutorial = create<TutorialStore>((set, get) => {
  /** Moves to `next` (past the ability step when it does not apply), saving a finished run. */
  function settle(next: number): void {
    const { step, hasRole, abilityUsed } = get();
    const settled = skipAbilityStep(next, hasRole, abilityUsed);
    if (settled === step) {
      return;
    }
    set({ step: settled });
    if (settled >= TUTORIAL_DONE) {
      writeStored('local', DONE_KEY, '1');
    }
  }
  return {
    step: null,
    hasRole: false,
    abilityUsed: false,
    start(hasRole) {
      const step = get().step;
      if (step !== null && step < TUTORIAL_DONE) {
        // Still running from the previous level: the role may differ in this one.
        set({ hasRole });
        settle(step);
        return;
      }
      // A closing card left over from a level that ended before it was hidden goes away too.
      set({ step: tutorialSeen() ? null : 0, hasRole, abilityUsed: false });
    },
    setHasRole(hasRole) {
      const { step } = get();
      if (hasRole === get().hasRole) {
        return;
      }
      set({ hasRole });
      if (step !== null && step < TUTORIAL_DONE) {
        settle(step);
      }
    },
    signal(signal) {
      const step = get().step;
      if (step === null || step >= TUTORIAL_DONE) {
        return;
      }
      if (signal === 'abilityUsed') {
        set({ abilityUsed: true });
      }
      settle(advanceTutorial(step, signal));
    },
    skip() {
      writeStored('local', DONE_KEY, '1');
      set({ step: null });
    },
    close() {
      set({ step: null });
    },
  };
});
