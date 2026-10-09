// Caption stack store plus the wiring from the feedback bus: every emitted cue with a caption
// rule becomes a chip while the "captions" setting is on (sound on or off).
import { create } from 'zustand';
import { type Cue, type CueId, cues } from '../fx/cues.ts';
import { type CueContext, feedback } from '../fx/feedback.ts';
import { useSettings } from '../store/settings.ts';
import {
  type CaptionInput,
  type CaptionState,
  emptyCaptions,
  pruneCaptions,
  pushCaption,
} from './caption-model.ts';
import { captionFor } from './captions.ts';

type CaptionStore = CaptionState & {
  push(input: CaptionInput, now?: number): void;
  prune(now?: number): void;
  clear(): void;
};

export const useCaptions = create<CaptionStore>((set, get) => ({
  ...emptyCaptions,
  push(input, now = performance.now()) {
    const next = pushCaption(get(), input, now);
    set({ chips: next.chips, nextId: next.nextId });
  },
  prune(now = performance.now()) {
    const next = pruneCaptions(get(), now);
    if (next !== get()) {
      set({ chips: next.chips });
    }
  },
  clear() {
    set({ chips: [] });
  },
}));

/** True when a cue makes a sound a deaf or muted player would miss. */
function isAudible(id: CueId): boolean {
  const cue: Cue = cues[id];
  return cue.sound !== undefined;
}

/** Feeds cues into the stack; returns the unsubscribe function. */
export function startCaptions(): () => void {
  const stop = feedback.onCue((id: CueId, context: CueContext) => {
    if (!useSettings.getState().captions || !isAudible(id)) {
      return;
    }
    const rule = captionFor(id, context.remote === true);
    if (rule) {
      useCaptions.getState().push(rule);
    }
  });
  const stopSettings = useSettings.subscribe((state, previous) => {
    if (previous.captions && !state.captions) {
      useCaptions.getState().clear();
    }
  });
  return () => {
    stop();
    stopSettings();
    useCaptions.getState().clear();
  };
}
