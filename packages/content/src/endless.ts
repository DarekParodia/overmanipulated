// Endless mode (S4-11): a pure, seeded generator for a level that never ends by the clock. The
// whole schedule is built up front from the stories of every campaign level that all six
// stations can solve, so the server only has to hand the result to the simulation. Since S7-22 it
// deals on the station bag: whole shuffled rounds over the stations that decide a pool story,
// each slot drawing from its station's own deck, with the difficulty scaling the spawn interval
// and every deadline. Stations, stories, timing and events each draw from their own RNG stream.
import {
  createRng,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  type Difficulty,
  ENDLESS,
  ENDLESS_LEVEL_ID,
  hashText,
  type Rng,
  requiredStampsOf,
  type SimLevelEvent,
  type StationKind,
  type StoryBook,
  scaledDeadlineS,
} from '@redakcja/shared';
import { bagDrawer, bagStations, decidingStations } from './bag.ts';
import {
  levelNumberOf,
  levelStoryIds,
  proofCount,
  type StoryIdSource,
  storyBookFor,
} from './rules.ts';
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

/**
 * A story the endless stations can solve: they give at least as many proofs (justifying stamps
 * that are not hint-only) as the story requires, the rule `checkStoryFitsLevel` applies.
 */
function isSolvable(story: Story): boolean {
  return proofCount(story, ENDLESS_STATIONS) >= requiredStampsOf(story);
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
 * Stories endless mode may draw: every solvable story that a campaign level schedules or pools
 * (`levelStoryIds`; the level 0 greybox test content is left out), in campaign order. Falls back to all solvable
 * stories when no level schedules any.
 */
export function endlessStoryPool(
  levels: readonly (StoryIdSource & Pick<Level, 'id'>)[],
  stories: readonly Story[],
): Story[] {
  const scheduled = new Set(
    levels
      .filter((level) => levelNumberOf(level.id) !== 0)
      .flatMap((level) => levelStoryIds(level)),
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

const jitter = (rng: Rng) => 1 + (rng.next() * 2 - 1) * ENDLESS.intervalJitter;

const EVENT_KINDS = ['viral', 'bossCall', 'botRaid', 'outage', 'correction'] as const;

/** Salts of the RNG streams, so stories, timing and events never shift each other's draws. */
const ENDLESS_STORY_STREAM = hashText('endless.stories');
const ENDLESS_TIME_STREAM = hashText('endless.time');
const ENDLESS_EVENT_STREAM = hashText('endless.events');

/**
 * Every endless station that decides at least one pool story (`bagStations` over
 * ENDLESS_STATIONS), with its deck: the pool stories it decides, in pool order. A flex story sits
 * in the deck of every station that decides it.
 */
export function endlessDecks(pool: readonly Story[]): Map<StationKind, Story[]> {
  const deciding = new Map(pool.map((story) => [story, decidingStations(story, ENDLESS_STATIONS)]));
  return new Map(
    bagStations(pool, ENDLESS_STATIONS).map((station) => [
      station,
      pool.filter((story) => deciding.get(story)?.includes(station)),
    ]),
  );
}

function generateEvents(pool: readonly Story[], rng: Rng, difficulty: Difficulty): SimLevelEvent[] {
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
    const deadlineS = scaledDeadlineS(endlessDeadlineS(atS), difficulty);
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
 * Builds an endless level on the station bag (README §4): the next slot's station comes from
 * whole shuffled rounds over the stations that decide a pool story (`createRng(seed)`), its story
 * from that station's own deck (`bagDrawer`, on the story stream), drawn once more when it would
 * repeat the previous folder. The difficulty stretches or packs the spawn interval
 * (`spawnGapFactor`, jittered on the time stream) and scales every folder and event deadline
 * (`scaledDeadlineS`); events draw from their own stream. Every schedule entry records its slot's
 * station. Pure and deterministic: the same seed, levels, stories and difficulty always give the
 * same level. The layout is fixed.
 */
export function generateEndlessLevel(
  seed: number,
  levels: readonly Level[],
  stories: readonly Story[],
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): EndlessLevel {
  const pool = endlessStoryPool(levels, stories);
  const decks = endlessDecks(pool);
  if (decks.size === 0) {
    throw new Error('Endless mode needs at least one solvable story');
  }
  const nextStation = bagDrawer([...decks.keys()], createRng(seed));
  const storyRng = createRng(seed ^ ENDLESS_STORY_STREAM);
  const draws = new Map([...decks].map(([station, deck]) => [station, bagDrawer(deck, storyRng)]));
  const timeRng = createRng(seed ^ ENDLESS_TIME_STREAM);
  const { spawnGapFactor } = DIFFICULTY[difficulty];
  /** The next slot: a station and a story from its deck that differs from `previous`. */
  const deal = (previous: string | undefined): { station: StationKind; story: Story } => {
    let slot: { station: StationKind; story: Story } | undefined;
    // A deck's rounds never repeat a story back to back, so one more draw from the same deck
    // differs unless the deck holds only that story; then the next station gets a turn.
    for (let attempt = 0; attempt <= decks.size; attempt++) {
      const station = nextStation();
      const draw = draws.get(station);
      if (!draw) {
        continue;
      }
      let story = draw();
      if (story.id === previous) {
        story = draw();
      }
      slot = { station, story };
      if (story.id !== previous) {
        break;
      }
    }
    if (!slot) {
      throw new Error('Endless mode found no station deck');
    }
    return slot;
  };
  const schedule: Level['schedule'][number][] = [];
  let atS: number = ENDLESS.firstSpawnS;
  while (atS < ENDLESS.scheduleLengthS) {
    const { station, story } = deal(schedule.at(-1)?.storyId);
    schedule.push({
      atS: round1(atS),
      storyId: story.id,
      deadlineS: scaledDeadlineS(endlessDeadlineS(atS), difficulty),
      station,
    });
    atS += endlessIntervalS(atS) * spawnGapFactor * jitter(timeRng);
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
    events: generateEvents(pool, createRng(seed ^ ENDLESS_EVENT_STREAM), difficulty),
    stars: { ...ENDLESS.stars },
  };
}

/** The stories a generated level uses (schedule and events), as the simulation consumes them. */
export function storiesForEndless(
  level: Level,
  stories: readonly Story[],
): StoryBook & Readonly<Record<string, Story>> {
  return storyBookFor(level, stories);
}
