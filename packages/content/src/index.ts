// Game content: levels and stories, validated against the schemas when this module loads, so a
// broken file fails fast on both server and client. New files are registered in files.ts.
import { ENDLESS_LEVEL_ID, type StoryBook } from '@redakcja/shared';
import { ENDLESS_PREVIEW_SEED, generateEndlessLevel } from './endless.ts';
import { LEVEL_FILES, STORY_FILES, TECHNIQUE_FILES } from './files.ts';
import {
  type Level,
  levelSchema,
  type Story,
  storyFileSchema,
  type Technique,
  techniqueFileSchema,
} from './schema.ts';

export * from './endless.ts';
export * from './schema.ts';

export const LEVELS: readonly Level[] = Object.values(LEVEL_FILES).map((file) =>
  levelSchema.parse(file),
);
export const STORIES: readonly Story[] = Object.values(STORY_FILES).flatMap((file) =>
  storyFileSchema.parse(file),
);

/** Encyclopedia cards, in display order (S5-04). */
export const TECHNIQUES: readonly Technique[] = Object.values(TECHNIQUE_FILES).flatMap((file) =>
  techniqueFileSchema.parse(file),
);

/** The level a new room starts with. */
export const DEFAULT_LEVEL_ID = 'l0-greybox';

const storiesById = new Map(STORIES.map((story) => [story.id, story]));
const levelsById = new Map(LEVELS.map((level) => [level.id, level]));

let endlessPreview: Level | undefined;

/**
 * A level by id. The endless id returns a preview built with a fixed seed (title, briefing,
 * layout); the real run's schedule is generated per run with `generateEndlessLevel`.
 */
export function getLevel(id: string): Level | undefined {
  if (id === ENDLESS_LEVEL_ID) {
    endlessPreview ??= generateEndlessLevel(ENDLESS_PREVIEW_SEED, LEVELS, STORIES);
    return endlessPreview;
  }
  return levelsById.get(id);
}

export function getStory(id: string): Story | undefined {
  return storiesById.get(id);
}

/** The stories a level schedules, keyed by id, as the simulation consumes them. */
export function storiesForLevel(level: Level): StoryBook & Readonly<Record<string, Story>> {
  const book: Record<string, Story> = {};
  const storyIds = [
    ...level.schedule.map((spawn) => spawn.storyId),
    ...level.events.flatMap((event) => (event.kind === 'outage' ? [] : [event.storyId])),
  ];
  for (const storyId of storyIds) {
    const story = storiesById.get(storyId);
    if (story) {
      book[story.id] = story;
    }
  }
  return book;
}
