// Game content: levels and stories, validated against the schemas when this module loads, so a
// broken file fails fast on both server and client. Add new files to the lists below.
import type { StoryBook } from '@redakcja/shared';
import l0Level from '../levels/l0-greybox.json';
import l0Stories from '../stories/l0-greybox.json';
import { type Level, levelSchema, type Story, storyFileSchema } from './schema.ts';

export * from './schema.ts';

const LEVEL_FILES: readonly unknown[] = [l0Level];
const STORY_FILES: readonly unknown[] = [l0Stories];

export const LEVELS: readonly Level[] = LEVEL_FILES.map((file) => levelSchema.parse(file));
export const STORIES: readonly Story[] = STORY_FILES.flatMap((file) => storyFileSchema.parse(file));

/** The level a new room starts with. */
export const DEFAULT_LEVEL_ID = 'l0-greybox';

const storiesById = new Map(STORIES.map((story) => [story.id, story]));
const levelsById = new Map(LEVELS.map((level) => [level.id, level]));

export function getLevel(id: string): Level | undefined {
  return levelsById.get(id);
}

export function getStory(id: string): Story | undefined {
  return storiesById.get(id);
}

/** The stories a level schedules, keyed by id, as the simulation consumes them. */
export function storiesForLevel(level: Level): StoryBook & Readonly<Record<string, Story>> {
  const book: Record<string, Story> = {};
  for (const spawn of level.schedule) {
    const story = storiesById.get(spawn.storyId);
    if (story) {
      book[story.id] = story;
    }
  }
  return book;
}
