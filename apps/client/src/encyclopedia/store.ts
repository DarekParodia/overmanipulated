// Collected technique cards per browser (S5-04), `redakcja.encyclopedia.v1`, no accounts. The
// debrief (Kolegium) records the stories of a finished level; cards the player met unlock. Also
// holds whether the encyclopedia is open and which card it opens on.
import { getStory, TECHNIQUES } from '@redakcja/content';
import { create } from 'zustand';
import { readStored, writeStored } from '../store/safe-storage.ts';
import { type Meeting, type Met, parseMet, withMeetings } from './model.ts';

export const ENCYCLOPEDIA_KEY = 'redakcja.encyclopedia.v1';

type EncyclopediaStore = {
  met: Met;
  open: boolean;
  /** Card the screen opens on; null opens on the first one. */
  focusId: string | null;
  /** Stores the techniques of the stories seen in a debrief; returns the newly unlocked cards. */
  record(storyIds: readonly string[]): string[];
  show(focusId?: string | null): void;
  hide(): void;
};

export const useEncyclopedia = create<EncyclopediaStore>((set, get) => ({
  met: parseMet(readStored('local', ENCYCLOPEDIA_KEY)),
  open: false,
  focusId: null,
  record(storyIds) {
    const meetings: Meeting[] = storyIds.flatMap((storyId) => {
      const story = getStory(storyId);
      return story ? [{ storyId, techniqueId: story.technique }] : [];
    });
    const { met, unlocked } = withMeetings(get().met, TECHNIQUES, meetings);
    if (met !== get().met) {
      set({ met });
      writeStored('local', ENCYCLOPEDIA_KEY, JSON.stringify(met));
    }
    return unlocked;
  },
  show(focusId = null) {
    set({ open: true, focusId });
  },
  hide() {
    set({ open: false });
  },
}));
