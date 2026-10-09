// Endless mode (S4-11): a pure, seeded generator for a level that never ends by the clock. The
// whole schedule is built up front from the stories of every campaign level that all six
// stations can solve, so the server only has to hand the result to the simulation.
import {
  createRng,
  ENDLESS,
  ENDLESS_LEVEL_ID,
  type SimLevelEvent,
  type StationKind,
  type StoryBook,
} from '@redakcja/shared';
import { levelNumberOf } from './checks.ts';
import type { Level, Story } from './schema.ts';

/** An endless level: a regular `Level` that the sim ends only at 0 credibility. */
export type EndlessLevel = Level & { endless: true };

/**
 * 24 x 14: all six stations (I A R along the top wall, P S L along the bottom), the conveyor,
 * two put-down tables beside the desk, and four spawns.
 */
export const ENDLESS_LAYOUT: readonly string[] = [
  '########################',
  '#CCCCCC.=I==A==R=......#',
  '#......................#',
  '#..T....1......2....T..#',
  '#......................#',
  '#.......T==DD==T.......#',
  '#..==....====....==....#',
  '#......................#',
  '#...3..............4...#',
  '#......................#',
  '#..=P=....=S=....=L=...#',
  '#......................#',
  '#.==................==.#',
  '########################',
];

export const ENDLESS_STATIONS: readonly StationKind[] = [
  'imageSearch',
  'archive',
  'sourceRegistry',
  'phone',
  'aiScanner',
  'dataLibrary',
];

/** Seed used for the level shown before a run starts (lobby card, briefing). */
export const ENDLESS_PREVIEW_SEED = 0;

/** A story all six stations can solve: some non-scanner stamp justifies the verdict. */
function isSolvable(story: Story): boolean {
  return story.justifyingStamps.some((id) => {
    const stamp = story.stamps.find((s) => s.id === id);
    return stamp !== undefined && stamp.station !== 'aiScanner';
  });
}

/** Campaign order: level number first, then id; stable for any set of content files. */
function byCampaignOrder(a: Story, b: Story): number {
  const diff = (levelNumberOf(a.id) ?? 0) - (levelNumberOf(b.id) ?? 0);
  if (diff !== 0) {
    return diff;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Stories endless mode may draw: every solvable story that a campaign level schedules (the
 * level 0 greybox test content is left out), in campaign order. Falls back to all solvable
 * stories when no level schedules any.
 */
export function endlessStoryPool(levels: readonly Level[], stories: readonly Story[]): Story[] {
  const scheduled = new Set(
    levels
      .filter((level) => levelNumberOf(level.id) !== 0)
      .flatMap((level) => level.schedule.map((spawn) => spawn.storyId)),
  );
  const solvable = stories.filter(isSolvable).sort(byCampaignOrder);
  const pool = solvable.filter((story) => scheduled.has(story.id) && levelNumberOf(story.id) !== 0);
  return pool.length > 0 ? pool : solvable;
}

/** Seconds between folders at level time `atS`: shrinks every minute down to the minimum. */
export function endlessIntervalS(atS: number): number {
  const minutes = Math.floor(atS / 60);
  return Math.max(
    ENDLESS.minIntervalS,
    ENDLESS.startIntervalS * ENDLESS.intervalFactorPerMinute ** minutes,
  );
}

/** Time a folder has when it arrives at level time `atS`. */
export function endlessDeadlineS(atS: number): number {
  const minutes = Math.floor(atS / 60);
  return Math.max(
    ENDLESS.minDeadlineS,
    ENDLESS.startDeadlineS - ENDLESS.deadlineShrinkPerMinuteS * minutes,
  );
}

function endlessEventIntervalS(atS: number): number {
  const minutes = Math.floor(atS / 60);
  return Math.max(
    ENDLESS.minEventIntervalS,
    ENDLESS.eventIntervalS * ENDLESS.eventIntervalFactorPerMinute ** minutes,
  );
}

const round1 = (value: number) => Math.round(value * 10) / 10;

type Rng = ReturnType<typeof createRng>;

const jitter = (rng: Rng) => 1 + (rng.next() * 2 - 1) * ENDLESS.intervalJitter;

/** Shuffled rounds over the pool, never the same story twice in a row. */
function storyDrawer(pool: readonly Story[], rng: Rng): () => Story {
  let bag: Story[] = [];
  let last: Story | undefined;
  const refill = () => {
    bag = [...pool];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [bag[i], bag[j]] = [bag[j] as Story, bag[i] as Story];
    }
    // The bag is drawn from the end; keep the previous round's last story away from it.
    const end = bag.length - 1;
    if (bag.length > 1 && bag[end] === last) {
      [bag[0], bag[end]] = [bag[end] as Story, bag[0] as Story];
    }
  };
  return () => {
    if (bag.length === 0) {
      refill();
    }
    const story = bag.pop() as Story;
    last = story;
    return story;
  };
}

const EVENT_KINDS = ['viral', 'bossCall', 'botRaid', 'outage', 'correction'] as const;

function generateEvents(pool: readonly Story[], rng: Rng): SimLevelEvent[] {
  const fakes = pool.filter((story) => story.truth !== 'true');
  const trues = pool.filter((story) => story.truth === 'true');
  const corrections = pool.filter((story) => story.correctVerdict === 'publishWithContext');
  const pick = (list: readonly Story[]): Story => {
    const from = list.length > 0 ? list : pool;
    return from[rng.int(from.length)] as Story;
  };
  const events: SimLevelEvent[] = [];
  let atS: number = ENDLESS.eventsStartS;
  while (atS < ENDLESS.scheduleLengthS) {
    const kind = EVENT_KINDS[rng.int(EVENT_KINDS.length)] as (typeof EVENT_KINDS)[number];
    const deadlineS = endlessDeadlineS(atS);
    const at = Math.round(atS);
    switch (kind) {
      case 'outage':
        events.push({
          kind,
          atS: at,
          station: ENDLESS_STATIONS[rng.int(ENDLESS_STATIONS.length)] as StationKind,
          durationS: 20,
        });
        break;
      case 'botRaid':
        events.push({
          kind,
          atS: at,
          storyId: pick(fakes).id,
          deadlineS,
          count: ENDLESS.botRaidCount,
        });
        break;
      case 'bossCall':
        events.push({ kind, atS: at, storyId: pick(trues).id, deadlineS });
        break;
      case 'correction':
        events.push({ kind, atS: at, storyId: pick(corrections).id, deadlineS });
        break;
      case 'viral':
        events.push({ kind, atS: at, storyId: pick(fakes).id, deadlineS });
        break;
    }
    atS += endlessEventIntervalS(atS) * jitter(rng);
  }
  return events;
}

/**
 * Builds an endless level. Pure and deterministic: the same seed, levels and stories always
 * give the same level. The layout is fixed; only the schedule and events depend on the seed.
 */
export function generateEndlessLevel(
  seed: number,
  levels: readonly Level[],
  stories: readonly Story[],
): EndlessLevel {
  const pool = endlessStoryPool(levels, stories);
  if (pool.length === 0) {
    throw new Error('Endless mode needs at least one solvable story');
  }
  const rng = createRng(seed);
  const draw = storyDrawer(pool, rng);
  const schedule: Level['schedule'][number][] = [];
  let atS: number = ENDLESS.firstSpawnS;
  while (atS < ENDLESS.scheduleLengthS) {
    schedule.push({ atS: round1(atS), storyId: draw().id, deadlineS: endlessDeadlineS(atS) });
    atS += endlessIntervalS(atS) * jitter(rng);
  }
  return {
    id: ENDLESS_LEVEL_ID,
    endless: true,
    title: 'Dyżur bez końca',
    topic: 'Nieustanny dyżur',
    briefing:
      'Teczki napływają bez przerwy i coraz szybciej. Wszystkie stanowiska działają. Dyżur kończy się dopiero, gdy zaufanie czytelników spadnie do zera. Liczy się wynik i czas dyżuru.',
    briefingPoints: [
      'Teczki napływają coraz szybciej.',
      'Koniec dyżuru przy zerowym zaufaniu.',
      'Liczy się wynik i czas dyżuru.',
    ],
    durationS: ENDLESS.durationS,
    layout: [...ENDLESS_LAYOUT],
    stations: [...ENDLESS_STATIONS],
    schedule,
    events: generateEvents(pool, rng),
    stars: { ...ENDLESS.stars },
  };
}

/** The stories a generated level uses (schedule and events), as the simulation consumes them. */
export function storiesForEndless(
  level: Level,
  stories: readonly Story[],
): StoryBook & Readonly<Record<string, Story>> {
  const byId = new Map(stories.map((story) => [story.id, story]));
  const ids = new Set([
    ...level.schedule.map((spawn) => spawn.storyId),
    ...level.events.flatMap((event) => (event.kind === 'outage' ? [] : [event.storyId])),
  ]);
  const book: Record<string, Story> = {};
  for (const id of ids) {
    const story = byId.get(id);
    if (story) {
      book[id] = story;
    }
  }
  return book;
}
