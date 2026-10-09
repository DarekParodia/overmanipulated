// Pure logic behind the technique encyclopedia (S5-04): which cards the player has collected,
// how a story's technique id maps to a card, and grid navigation. Free of React and of the
// content module (techniques and lookups are passed in) so it is unit-tested directly.
import type { NavIntent } from '../input/ui-nav.ts';

/** The part of a content technique the model needs. */
export type TechniqueEntry = { id: string; aliases: readonly string[] };

/** Technique card id to the story ids the player has met it in (debrief order, no repeats). */
export type Met = Readonly<Record<string, readonly string[]>>;

/** One story the player saw in a debrief, with the technique id its content names. */
export type Meeting = { storyId: string; techniqueId: string };

/** Stories remembered per card; plenty for the real content, bounds a tampered store. */
const MAX_STORIES_PER_CARD = 40;

/** The card that collects a story's technique id: the card's own id or one of its aliases. */
export function resolveTechniqueId(
  techniques: readonly TechniqueEntry[],
  storyTechnique: string,
): string | null {
  const card = techniques.find(
    (technique) => technique.id === storyTechnique || technique.aliases.includes(storyTechnique),
  );
  return card?.id ?? null;
}

/** Reads the stored collection; anything malformed is dropped, never thrown. */
export function parseMet(raw: string | null): Met {
  if (!raw) {
    return {};
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {};
  }
  const out: Record<string, string[]> = {};
  for (const [id, value] of Object.entries(data)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const stories = value.filter((entry): entry is string => typeof entry === 'string');
    if (stories.length > 0) {
      out[id] = [...new Set(stories)].slice(0, MAX_STORIES_PER_CARD);
    }
  }
  return out;
}

/**
 * Adds the stories of a debrief to the collection. `unlocked` lists the cards that were new, in
 * order; the same object comes back when nothing changed.
 */
export function withMeetings(
  met: Met,
  techniques: readonly TechniqueEntry[],
  meetings: readonly Meeting[],
): { met: Met; unlocked: string[] } {
  let next: Record<string, readonly string[]> | null = null;
  const unlocked: string[] = [];
  for (const { storyId, techniqueId } of meetings) {
    const card = resolveTechniqueId(techniques, techniqueId);
    if (card === null) {
      continue;
    }
    const current = (next ?? met)[card];
    if (current?.includes(storyId)) {
      continue;
    }
    next ??= { ...met };
    if (current === undefined) {
      unlocked.push(card);
    }
    next[card] = [...(current ?? []), storyId].slice(0, MAX_STORIES_PER_CARD);
  }
  return { met: next ?? met, unlocked };
}

export type CardView<T extends TechniqueEntry> = {
  technique: T;
  unlocked: boolean;
  /** Stories the player met this technique in (spoilers only for these). */
  stories: readonly string[];
};

/** All cards in content order with their lock state. */
export function cardViews<T extends TechniqueEntry>(
  techniques: readonly T[],
  met: Met,
): CardView<T>[] {
  return techniques.map((technique) => {
    const stories = met[technique.id] ?? [];
    return { technique, unlocked: stories.length > 0, stories };
  });
}

export function unlockedCount(views: readonly { unlocked: boolean }[]): number {
  return views.filter((view) => view.unlocked).length;
}

/** Story ids `l<n>-slug` to the level number n; null for ids without one. */
export function levelNumberOfStory(storyId: string): number | null {
  const match = /^l(\d+)-/.exec(storyId);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/**
 * Moves the selection in a grid with `columns` columns. Left/right step by one, up/down by a
 * row; every move stays on the list (no wrap), and a short last row clamps to its last card.
 */
export function gridStep(index: number, intent: NavIntent, columns: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  const cols = Math.max(1, columns);
  let next = index;
  if (intent === 'left') {
    next = index - 1;
  } else if (intent === 'right') {
    next = index + 1;
  } else if (intent === 'up') {
    next = index - cols;
    if (next < 0) {
      return index;
    }
  } else if (intent === 'down') {
    next = index + cols;
    if (next >= count && index < count - 1) {
      next = count - 1;
    }
  } else {
    return index;
  }
  return Math.max(0, Math.min(count - 1, next));
}
