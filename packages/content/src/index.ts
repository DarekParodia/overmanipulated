// Game content: levels and stories, validated against the schemas when this module loads, so a
// broken file fails fast on both server and client. New files are registered in files.ts.
import type { StoryBook } from '@redakcja/shared';
import { LEVEL_FILES, STORY_FILES } from './files.ts';
import { type Level, levelSchema, type Story, storyFileSchema } from './schema.ts';

export * from './schema.ts';

export const LEVELS: readonly Level[] = Object.values(LEVEL_FILES).map((file) =>
  levelSchema.parse(file),
);
export const STORIES: readonly Story[] = Object.values(STORY_FILES).flatMap((file) =>
  storyFileSchema.parse(file),
);

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
