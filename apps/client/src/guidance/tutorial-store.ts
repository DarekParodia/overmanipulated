// First-game tutorial state. Runs once per browser: finishing or skipping it sets a flag.
import { create } from 'zustand';
import { readStored, writeStored } from '../store/safe-storage.ts';
import { advanceTutorial, TUTORIAL_DONE, type TutorialSignal } from './tutorial.ts';

const DONE_KEY = 'redakcja.tutorial.done';

type TutorialStore = {
  /** Current step index; `TUTORIAL_DONE` shows the closing card; null when not running. */
  step: number | null;
  /** Starts the tutorial unless this browser already finished or skipped it. */
  start(): void;
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

export const useTutorial = create<TutorialStore>((set, get) => ({
  step: null,
  start() {
    const step = get().step;
    if (step !== null && step < TUTORIAL_DONE) {
      return;
    }
    // A closing card left over from a level that ended before it was hidden goes away too.
    set({ step: tutorialSeen() ? null : 0 });
  },
  signal(signal) {
    const step = get().step;
    if (step === null || step >= TUTORIAL_DONE) {
      return;
    }
    const next = advanceTutorial(step, signal);
    if (next !== step) {
      set({ step: next });
      if (next >= TUTORIAL_DONE) {
        writeStored('local', DONE_KEY, '1');
      }
    }
  },
  skip() {
    writeStored('local', DONE_KEY, '1');
    set({ step: null });
  },
  close() {
    set({ step: null });
  },
}));
