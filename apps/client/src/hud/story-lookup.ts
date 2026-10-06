// Story facts for the HUD. Content stories come from @redakcja/content; the dev fixture can
// register extra fictional stories (e.g. an urgent one the greybox level doesn't have).
import { getStory } from '@redakcja/content';
import type { StoryInfo } from './hud-model.ts';

const extraStories = new Map<string, StoryInfo>();

export function hudStory(storyId: string): StoryInfo | undefined {
  return getStory(storyId) ?? extraStories.get(storyId);
}

/** Dev fixture only. */
export function registerHudStory(storyId: string, story: StoryInfo): void {
  extraStories.set(storyId, story);
}
