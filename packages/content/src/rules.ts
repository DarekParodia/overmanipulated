// Content rules shared by validation (checks.ts), the station bag (bag.ts), run preparation
// (run.ts) and endless mode: the proof count, the score a perfect team can reach and which stories
// a level uses. Pure and import-free within this package, so every module can read it without an
// import cycle.
import {
  countsAsProof,
  EVENTS,
  type ProofStory,
  requiredStampsOf,
  SCORE,
  type SimLevel,
  type SimStory,
  type StationKind,
  type StoryBook,
} from '@redakcja/shared';

/** Number in a content id: `l3-foo` → 3. */
export function levelNumberOf(id: string): number | undefined {
  const match = /^l(\d+)-/.exec(id);
  return match ? Number(match[1]) : undefined;
}

/**
 * Points for a correct verdict delivered with more than half the time left (design doc), plus
 * the multi-stamp bonus for every proof beyond the first (S7-18).
 */
export function maxStoryScore(
  story: Pick<SimStory, 'priority' | 'correctVerdict' | 'requiredStamps'>,
): number {
  const base =
    story.correctVerdict === 'publishWithContext'
      ? SCORE.correctWithContext
      : story.priority === 'normal'
        ? SCORE.correctNormal
        : SCORE.correctImportant;
  return base + SCORE.speedBonus + (requiredStampsOf(story) - 1) * SCORE.multiStampBonus;
}

/**
 * Distinct proofs `stations` can give the story: justifying stamps that count as proof
 * (`countsAsProof`, so never a hint-only stamp) from one of those stations. The story can be
 * solved there when this reaches `requiredStampsOf(story)`.
 */
export function proofCount(story: ProofStory, stations: Iterable<StationKind>): number {
  const available = new Set(stations);
  const proofs = story.justifyingStamps.filter((id) => {
    const station = story.stamps.find((stamp) => stamp.id === id)?.station;
    return station !== undefined && available.has(station) && countsAsProof(story, id);
  });
  return new Set(proofs).size;
}

/** The parts of a level that decide its maximum score. */
export type ScoredLevel = Pick<SimLevel, 'schedule' | 'events'>;

/**
 * The best score a perfect team can reach on a level: scheduled stories plus what the events add.
 * A viral story scores like a normal one; a boss call adds its bonus for true stories; a bot raid
 * is one verdict, one result; a correction folder scores `correctionScore` when filed.
 */
export function maxLevelScore(
  level: ScoredLevel,
  storiesById: ReadonlyMap<string, SimStory>,
): number {
  let total = 0;
  for (const spawn of level.schedule) {
    const story = storiesById.get(spawn.storyId);
    if (story) {
      total += maxStoryScore(story);
    }
  }
  for (const event of level.events ?? []) {
    if (event.kind === 'outage') {
      continue;
    }
    const story = storiesById.get(event.storyId);
    if (!story) {
      continue;
    }
    if (event.kind === 'correction') {
      total += EVENTS.correctionScore;
    } else {
      total += maxStoryScore(story);
      if (event.kind === 'bossCall' && story.truth === 'true') {
        total += EVENTS.bossCallBonusScore;
      }
    }
  }
  return total;
}

/** What `levelStoryIds` reads: a level file, a resolved level or a loose JSON view of one. */
export type StoryIdSource = {
  readonly schedule?: readonly { readonly storyId: string }[] | undefined;
  readonly bag?: { readonly pool: readonly string[] } | undefined;
};

/**
 * The stories a level deals onto the conveyor, without its event stories: the bag pool of a bag
 * level (a resolved preview schedules only some of them), otherwise the scheduled ids, each once
 * in first-use order.
 */
export function levelStoryIds(level: StoryIdSource): string[] {
  return [...new Set(level.bag?.pool ?? (level.schedule ?? []).map((spawn) => spawn.storyId))];
}

/**
 * The stories a level uses (schedule and spawning events), keyed by id, as the simulation
 * consumes them. Ids missing from `stories` are left out.
 */
export function storyBookFor<S extends SimStory>(
  level: ScoredLevel,
  stories: readonly S[],
): StoryBook & Readonly<Record<string, S>> {
  const byId = new Map(stories.map((story) => [story.id, story]));
  const ids = new Set([
    ...level.schedule.map((spawn) => spawn.storyId),
    ...(level.events ?? []).flatMap((event) => (event.kind === 'outage' ? [] : [event.storyId])),
  ]);
  const book: Record<string, S> = {};
  for (const id of ids) {
    const story = byId.get(id);
    if (story) {
      book[id] = story;
    }
  }
  return book;
}
