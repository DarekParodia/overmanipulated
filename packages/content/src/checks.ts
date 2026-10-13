// Pure content checks: schema parsing plus the cross-file rules from agents/content-authoring.md
// (unique ids, schedules that reference existing stories, solvability with the level's
// stations, star thresholds within reach, Polish typography). No I/O here; validate.ts loads the
// files and prints the issues, tests feed fixtures directly.
import {
  CONTENT_THREE_STARS_SHARE,
  CONTENT_TRUE_STORY_SHARE,
  CONTENT_TWO_STARS_SHARE,
  createRng,
  DIFFICULTIES,
  ENDLESS_MIN_DECK,
  isHintOnly,
  MULTI_STAMP_FIRST_LEVEL,
  multiStampExtraMs,
  parseLayout,
  requiredStampsOf,
  type StationKind,
} from '@redakcja/shared';
import type { z } from 'zod';
import { bagSlotTimes, bagStations, matchStories, pinnedCounts } from './bag.ts';
import { ENDLESS_STATIONS, endlessDecks, endlessStoryPool } from './endless.ts';
import {
  levelNumberOf,
  levelStoryIds,
  maxLevelScore,
  proofCount,
  type StoryIdSource,
} from './rules.ts';
import {
  type LevelBag,
  type LevelFile,
  levelFileSchema,
  type Story,
  storySchema,
  type Technique,
  techniqueSchema,
} from './schema.ts';

export { levelNumberOf, levelStoryIds, maxLevelScore, maxStoryScore, proofCount } from './rules.ts';

export type Severity = 'error' | 'warning';

export type Issue = {
  severity: Severity;
  /** File the issue belongs to, relative to the content root (e.g. `stories/l0-greybox.json`). */
  file: string;
  /** Location inside the file, e.g. `[3].justifyingStamps[0]` or `schedule[2].storyId`. */
  path: string;
  message: string;
};

/** A parsed JSON file and where it came from. */
export type ContentFile = { file: string; data: unknown };

type PathPart = PropertyKey;

export function formatPath(parts: readonly PathPart[]): string {
  let out = '';
  for (const part of parts) {
    out += typeof part === 'number' ? `[${part}]` : out ? `.${String(part)}` : String(part);
  }
  return out;
}

export function formatIssue(issue: Issue): string {
  const where = issue.path ? `${issue.file} ${issue.path}` : issue.file;
  return `${issue.severity === 'error' ? 'error  ' : 'warning'} ${where}: ${issue.message}`;
}

/** Same-kind level events closer than this (seconds) are reported. */
export const EVENT_MIN_GAP_S = 10;

/** Validates all content. Returns every issue found; an empty list means the content is valid. */
export function validateContent(
  levelFiles: readonly ContentFile[],
  storyFiles: readonly ContentFile[],
): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, file: string, path: readonly PathPart[], message: string) =>
    issues.push({ severity, file, path: formatPath(path), message });
  const addZod = (file: string, prefix: readonly PathPart[], error: z.ZodError) => {
    for (const issue of error.issues) {
      add('error', file, [...prefix, ...issue.path], issue.message);
    }
  };

  // --- Stories: parse each entry on its own so one broken story does not hide the rest. ---
  type Located = { story: Story; file: string; index: number };
  const stories = new Map<string, Located>();
  for (const { file, data } of storyFiles) {
    if (!Array.isArray(data)) {
      add('error', file, [], 'expected an array of stories');
      continue;
    }
    data.forEach((entry: unknown, index) => {
      const parsed = storySchema.safeParse(entry);
      if (!parsed.success) {
        addZod(file, [index], parsed.error);
        return;
      }
      const story = parsed.data;
      const first = stories.get(story.id);
      if (first) {
        add(
          'error',
          file,
          [index, 'id'],
          `duplicate story id "${story.id}" (first in ${first.file})`,
        );
        return;
      }
      stories.set(story.id, { story, file, index });
      checkStory(story, (path, severity, message) =>
        add(severity, file, [index, ...path], message),
      );
    });
  }

  // --- Levels ---
  const storiesById = new Map([...stories].map(([id, located]) => [id, located.story]));
  const levelIds = new Set<string>();
  const parsedLevels: LevelFile[] = [];
  const used = new Set<string>();
  /** Stations of every (parsed) level that schedules, pools or spawns the story. */
  const hostStations = new Map<string, Set<StationKind>>();
  for (const { file, data } of levelFiles) {
    // Read story ids from the raw data too, so a level that fails the schema does not make its
    // stories look unused.
    for (const id of rawStoryIds(data)) {
      used.add(id);
    }
    const parsed = levelFileSchema.safeParse(data);
    if (!parsed.success) {
      addZod(file, [], parsed.error);
      continue;
    }
    const level = parsed.data;
    // Event folders (viral, bossCall, ...) come from their own stories, not from the schedule.
    for (const event of level.events) {
      if ('storyId' in event) {
        used.add(event.storyId);
      }
    }
    if (levelIds.has(level.id)) {
      add('error', file, ['id'], `duplicate level id "${level.id}"`);
      continue;
    }
    levelIds.add(level.id);
    parsedLevels.push(level);
    checkTypography(level.title, ['title'], (path, severity, message) =>
      add(severity, file, path, message),
    );
    checkTypography(level.briefing, ['briefing'], (path, severity, message) =>
      add(severity, file, path, message),
    );
    checkLevel(level, storiesById, (path, severity, message) => add(severity, file, path, message));
    const eventIds = level.events.flatMap((event) =>
      event.kind === 'outage' ? [] : [event.storyId],
    );
    for (const id of [...levelStoryIds(level), ...eventIds]) {
      const hosts = hostStations.get(id) ?? new Set<StationKind>();
      for (const station of level.stations) {
        hosts.add(station);
      }
      hostStations.set(id, hosts);
    }
  }

  // A stamp from a station that no hosting level has can never be earned.
  for (const [id, hosts] of hostStations) {
    const located = stories.get(id);
    if (!located) {
      continue;
    }
    located.story.stamps.forEach((stamp, i) => {
      if (!hosts.has(stamp.station)) {
        add(
          'error',
          located.file,
          [located.index, 'stamps', i, 'station'],
          `stamp "${stamp.id}" uses station "${stamp.station}", which no level scheduling this story has`,
        );
      }
    });
  }

  for (const [id, { file, index }] of stories) {
    if (!used.has(id)) {
      add('warning', file, [index, 'id'], `story "${id}" is not scheduled in any level`);
    }
  }

  checkEndlessDecks(parsedLevels, [...storiesById.values()], (path, severity, message) =>
    add(severity, ENDLESS_ISSUE_FILE, path, message),
  );
  return issues;
}

/** Where endless deck issues are filed: they come from all campaign levels, not one file. */
export const ENDLESS_ISSUE_FILE = 'endless';

/**
 * Endless deals each station's folders from its own deck (S7-22): the pool stories the station
 * decides. A non-hint endless station whose deck holds fewer than ENDLESS_MIN_DECK stories repeats
 * them often, so it is reported. Skipped while no campaign level (above the level 0 greybox)
 * schedules or pools stories, because endless then has no campaign pool to deal from.
 */
export function checkEndlessDecks(
  levels: readonly (StoryIdSource & { readonly id: string })[],
  stories: readonly Story[],
  report: Report,
): void {
  const campaign = levels.filter(
    (level) => (levelNumberOf(level.id) ?? 0) !== 0 && levelStoryIds(level).length > 0,
  );
  if (campaign.length === 0) {
    return;
  }
  const decks = endlessDecks(endlessStoryPool(campaign, stories));
  for (const station of ENDLESS_STATIONS) {
    if (isHintOnly(station)) {
      continue;
    }
    const size = decks.get(station)?.length ?? 0;
    if (size < ENDLESS_MIN_DECK) {
      report(
        ['decks', station],
        'warning',
        `endless deck of station ${station} holds ${size} stories; aim for at least ${ENDLESS_MIN_DECK} (add stories decided at ${station} to a campaign level)`,
      );
    }
  }
}

function rawStoryIds(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const record = data as Record<string, unknown>;
  const entries = (['schedule', 'events'] as const).flatMap((key) => {
    const list = record[key];
    return Array.isArray(list) ? list : [];
  });
  const ids = entries.flatMap((spawn: unknown) =>
    typeof spawn === 'object' &&
    spawn !== null &&
    'storyId' in spawn &&
    typeof spawn.storyId === 'string'
      ? [spawn.storyId]
      : [],
  );
  const bag = record.bag;
  const pool =
    typeof bag === 'object' && bag !== null && 'pool' in bag && Array.isArray(bag.pool)
      ? bag.pool.filter((id: unknown): id is string => typeof id === 'string')
      : [];
  return [...ids, ...pool];
}

type Report = (path: readonly PathPart[], severity: Severity, message: string) => void;

function checkStory(story: Story, report: Report): void {
  const stampsById = new Map(story.stamps.map((stamp) => [stamp.id, stamp]));
  story.justifyingStamps.forEach((id, i) => {
    const stamp = stampsById.get(id);
    if (stamp && stamp.relevance !== 'decisive') {
      report(
        ['justifyingStamps', i],
        'error',
        `justifying stamp "${id}" must be decisive, not "${stamp.relevance}"`,
      );
    }
  });
  const justifyingStations = story.justifyingStamps.flatMap((id) => {
    const station = stampsById.get(id)?.station;
    return station ? [station] : [];
  });
  if (justifyingStations.length > 0 && justifyingStations.every((s) => s === 'aiScanner')) {
    report(['justifyingStamps'], 'error', 'an AI scanner stamp must never be decisive alone');
  }
  const hasOtherJustification = justifyingStations.some((station) => station !== 'aiScanner');
  story.stamps.forEach((stamp, i) => {
    if (stamp.station === 'aiScanner' && stamp.relevance === 'decisive' && !hasOtherJustification) {
      report(
        ['stamps', i, 'relevance'],
        'error',
        'an AI scanner stamp may only be decisive next to a justifying stamp from another station',
      );
    }
  });
  // A stamp that looks decisive but does not justify the verdict decides nothing (the one rule,
  // `proofCount`): the bag never deals the story to that station and guidance never sends it there.
  story.stamps.forEach((stamp, i) => {
    if (
      stamp.relevance === 'decisive' &&
      !isHintOnly(stamp.station) &&
      !story.justifyingStamps.includes(stamp.id)
    ) {
      report(
        ['stamps', i, 'relevance'],
        'warning',
        `decisive stamp "${stamp.id}" does not justify the verdict, so ${stamp.station} decides nothing; add it to justifyingStamps or lower its relevance`,
      );
    }
  });
  if (story.truth === 'true' && story.technique !== 'none') {
    report(['technique'], 'error', 'a true story has technique "none"');
  }
  if (story.truth !== 'true' && story.technique === 'none') {
    report(['technique'], 'error', `a "${story.truth}" story must name its technique`);
  }

  const texts: [readonly PathPart[], string][] = [
    [['headline'], story.headline],
    [['body'], story.body],
    [['source'], story.source],
    ...story.stamps.map((stamp, i): [readonly PathPart[], string] => [
      ['stamps', i, 'text'],
      stamp.text,
    ]),
    ...Object.entries(story.debrief).map(([key, value]): [readonly PathPart[], string] => [
      ['debrief', key],
      value,
    ]),
  ];
  if (story.media) {
    texts.push([['media', 'alt'], story.media.alt]);
  }
  for (const [path, value] of texts) {
    checkTypography(value, path, report);
  }
}

/** Polish typography: „…” quotes, – dashes, no hanging single-letter words at line ends. */
export function checkTypography(value: string, path: readonly PathPart[], report: Report): void {
  if (value.includes('"')) {
    report(path, 'error', 'use Polish quotes „…” instead of straight quotes');
  }
  if (/(?:^|\s)-\s/.test(value)) {
    report(path, 'error', 'use an en dash (–) instead of a spaced hyphen');
  }
  if (value.includes('...')) {
    report(path, 'warning', 'use an ellipsis (…) instead of three dots');
  }
  // A plain space (not  ) after a one-letter word lets it hang at the end of a line.
  const orphans = [...value.matchAll(/(?:^|[\s„(])([aiouwzAIOUWZ]) /g)].map((m) => m[1]);
  if (orphans.length > 0) {
    report(
      path,
      'warning',
      `single-letter word(s) ${orphans.map((w) => `"${w}"`).join(', ')} should be followed by a non-breaking space`,
    );
  }
}

/**
 * Level time in seconds when a folder spawned at `atS` with `deadlineS` expires: the sim adds the
 * multi-stamp extra time at spawn (`multiStampExtraMs`).
 */
function dueS(atS: number, deadlineS: number, story: Story): number {
  return atS + deadlineS + multiStampExtraMs(story) / 1000;
}

/** Rules a story must meet to be spawned in a level (scheduled or by an event). */
function checkStoryFitsLevel(
  story: Story,
  level: Pick<LevelFile, 'id' | 'stations'>,
  path: readonly PathPart[],
  report: Report,
): boolean {
  const stations = new Set<StationKind>(level.stations);
  const levelNumber = levelNumberOf(level.id);
  const storyNumber = levelNumberOf(story.id);
  if (storyNumber !== levelNumber) {
    report(
      path,
      'error',
      `story "${story.id}" belongs to level ${storyNumber}, not level ${levelNumber}`,
    );
  }
  const stampStations = new Set(story.stamps.map((stamp) => stamp.station));
  for (const station of level.stations) {
    if (!stampStations.has(station)) {
      report(path, 'error', `story "${story.id}" has no stamp for station "${station}"`);
    }
  }
  // A hint-only stamp (the AI scanner) is never proof, so it cannot make a story solvable.
  const required = requiredStampsOf(story);
  const proofs = proofCount(story, stations);
  if (proofs === 0) {
    const usable = [...stations].filter((station) => !isHintOnly(station));
    report(
      path,
      'error',
      `story "${story.id}" is unsolvable: no justifying stamp comes from ${usable.join(', ')}`,
    );
  } else if (proofs < required) {
    report(
      path,
      'error',
      `story "${story.id}" needs ${required} proofs, but this level's stations give only ${proofs}`,
    );
  }
  if (required > 1 && levelNumber !== undefined && levelNumber < MULTI_STAMP_FIRST_LEVEL) {
    report(
      path,
      'warning',
      `story "${story.id}" needs ${required} proofs; multi-stamp folders start at level ${MULTI_STAMP_FIRST_LEVEL}`,
    );
  }
  return proofs >= required;
}

/** The aim range for the share of true stories a level deals. */
function checkTrueShare(
  stories: readonly Story[],
  path: readonly PathPart[],
  report: Report,
): void {
  const unique = [...new Map(stories.map((story) => [story.id, story])).values()];
  if (unique.length === 0) {
    return;
  }
  const share = unique.filter((story) => story.truth === 'true').length / unique.length;
  const range = CONTENT_TRUE_STORY_SHARE;
  if (share < range.min || share > range.max) {
    report(
      path,
      'warning',
      `${Math.round(share * 100)}% of stories are true; aim for ${range.min * 100}–${range.max * 100}%`,
    );
  }
}

/** Whether a star threshold, as a share of the maximum score, sits in its aim range. */
function checkStarShare(
  key: 'two' | 'three',
  share: number,
  path: readonly PathPart[],
  report: Report,
  what: string,
): void {
  const range = key === 'two' ? CONTENT_TWO_STARS_SHARE : CONTENT_THREE_STARS_SHARE;
  if (share < range.min || share > range.max) {
    report(
      path,
      'warning',
      `${key} stars at ${Math.round(share * 100)}% of ${what}; aim for ${range.min * 100}–${range.max * 100}%`,
    );
  }
}

function checkLevel(
  level: LevelFile,
  storiesById: ReadonlyMap<string, Story>,
  report: Report,
): void {
  const levelNumber = levelNumberOf(level.id);
  if (levelNumber !== undefined && levelNumber >= 1) {
    if (!level.topic) {
      report(['topic'], 'warning', 'campaign levels need a topic for the briefing card');
    }
    if (!level.briefingPoints) {
      report(
        ['briefingPoints'],
        'warning',
        'campaign levels need briefingPoints (1–3 short lines)',
      );
    }
  }
  const eventsOk = checkEvents(level, storiesById, report);
  if (level.bag) {
    checkBag({ ...level, bag: level.bag }, storiesById, report);
  } else if (level.schedule && level.stars) {
    checkSchedule(level, level.schedule, level.stars, eventsOk, storiesById, report);
  }
}

/** A level with an authored schedule: its stories, deadlines, true share and stars. */
function checkSchedule(
  level: LevelFile,
  schedule: NonNullable<LevelFile['schedule']>,
  stars: NonNullable<LevelFile['stars']>,
  eventsOk: boolean,
  storiesById: ReadonlyMap<string, Story>,
  report: Report,
): void {
  const scheduled: Story[] = [];
  let broken = !eventsOk;
  schedule.forEach((spawn, i) => {
    const story = storiesById.get(spawn.storyId);
    if (!story) {
      report(['schedule', i, 'storyId'], 'error', `unknown story "${spawn.storyId}"`);
      broken = true;
      return;
    }
    scheduled.push(story);
    if (!checkStoryFitsLevel(story, level, ['schedule', i, 'storyId'], report)) {
      broken = true;
    }
    if (dueS(spawn.atS, spawn.deadlineS, story) > level.durationS) {
      report(['schedule', i, 'deadlineS'], 'warning', 'deadline runs past the end of the level');
    }
  });
  checkTrueShare(scheduled, ['schedule'], report);

  // The maximum score is only meaningful once every scheduled story is known and solvable.
  if (broken) {
    return;
  }
  const max = maxLevelScore({ schedule, events: level.events }, storiesById);
  if (stars.three > max) {
    report(['stars', 'three'], 'error', `three stars need ${stars.three}, max is ${max}`);
  } else if (max > 0) {
    const twoTooHigh = stars.two > max * 0.9;
    if (twoTooHigh) {
      report(
        ['stars', 'two'],
        'warning',
        `two stars need ${stars.two}, over 90% of the max score ${max}`,
      );
    } else {
      checkStarShare('two', stars.two / max, ['stars', 'two'], report, `the max score ${max}`);
    }
    checkStarShare('three', stars.three / max, ['stars', 'three'], report, `the max score ${max}`);
  }
}

/** A bag level as `checkBag` reads it. */
export type BagLevel = Pick<LevelFile, 'id' | 'durationS' | 'stations' | 'events'> & {
  bag: LevelBag;
};

/**
 * Pool rules of a bag level (S7-21). Errors: unknown pool ids, pool stories that do not fit the
 * level (wrong level number, a missing stamp, too few proofs), pool stories that are also event
 * stories, and coverage: on every difficulty, every worst-case split of the slots over the bag
 * stations must get distinct stories (`matchStories`). Warnings: a station with fewer pinned
 * stories than ⌈Normal slots / bag stations⌉, the share of true stories, a last folder whose
 * Normal deadline runs past the level end (the generator clamps it), star shares outside the aim
 * ranges, and a level station that decides no pool story.
 */
export function checkBag(
  level: BagLevel,
  storiesById: ReadonlyMap<string, Story>,
  report: Report,
): void {
  const { bag } = level;
  const eventIds = new Set(
    level.events.flatMap((event) => (event.kind === 'outage' ? [] : [event.storyId])),
  );
  const pool: Story[] = [];
  let broken = false;
  bag.pool.forEach((id, i) => {
    const path = ['bag', 'pool', i];
    const story = storiesById.get(id);
    if (!story) {
      report(path, 'error', `unknown story "${id}"`);
      broken = true;
      return;
    }
    if (eventIds.has(id)) {
      report(
        path,
        'error',
        `story "${id}" is also an event story; keep event stories out of the pool`,
      );
    }
    if (!checkStoryFitsLevel(story, level, path, report)) {
      broken = true;
    }
    pool.push(story);
  });
  checkTrueShare(pool, ['bag', 'pool'], report);

  const latest = Math.max(
    ...pool.map((story) => bag.deadlineS[story.priority] + multiStampExtraMs(story) / 1000),
  );
  if (pool.length > 0 && bag.lastSpawnS + latest > level.durationS) {
    report(
      ['bag', 'lastSpawnS'],
      'warning',
      `a folder at ${bag.lastSpawnS} s needs up to ${latest} s, past the level end at ${level.durationS} s; late folders get less time`,
    );
  }
  if (bag.starShares) {
    for (const key of ['two', 'three'] as const) {
      checkStarShare(
        key,
        bag.starShares[key],
        ['bag', 'starShares', key],
        report,
        'the run maximum',
      );
    }
  }
  if (broken) {
    return;
  }

  const stations = bagStations(pool, level.stations);
  level.stations.forEach((station, i) => {
    if (!isHintOnly(station) && !stations.includes(station)) {
      report(
        ['stations', i],
        'warning',
        `station "${station}" decides no pool story; it stays idle`,
      );
    }
  });
  if (stations.length === 0) {
    return;
  }
  for (const difficulty of DIFFICULTIES) {
    const slots = bagSlotTimes(bag, difficulty).length;
    for (const [station, demand] of coverageGaps(pool, level.stations, stations, slots)) {
      report(
        ['bag', 'pool'],
        'error',
        `station ${station} cannot get ${demand} distinct folders on ${difficulty}; add stories decided only at ${station}`,
      );
    }
  }
  const normalSlots = bagSlotTimes(bag, 'normal').length;
  const target = Math.ceil(normalSlots / stations.length);
  for (const [station, pinned] of pinnedCounts(pool, level.stations)) {
    if (pinned < target) {
      report(
        ['bag', 'pool'],
        'warning',
        `station ${station} has ${pinned} pinned stories (decided only there, one proof); aim for ${target} (${normalSlots} Normal folders over ${stations.length} stations)`,
      );
    }
  }
}

/**
 * Bag stations that cannot get distinct stories in a run of `slots` folders: every worst-case
 * split (`slots mod k` stations get one folder more) is matched, and the stations of the slots
 * left empty in the first split that fails are returned with their demand. Empty when the pool
 * covers every split.
 */
function coverageGaps(
  pool: readonly Story[],
  levelStations: readonly StationKind[],
  stations: readonly StationKind[],
  slots: number,
): Map<StationKind, number> {
  const base = Math.floor(slots / stations.length);
  const extra = slots % stations.length;
  for (const more of combinations(stations, extra)) {
    const demand = new Map(
      stations.map((station) => [station, base + (more.has(station) ? 1 : 0)]),
    );
    const sequence = stations.flatMap((station) =>
      Array.from({ length: demand.get(station) ?? 0 }, () => station),
    );
    const matched = matchStories(sequence, pool, levelStations, createRng(0));
    const gaps = new Map<StationKind, number>();
    matched.forEach((story, slot) => {
      const station = sequence[slot];
      if (!story && station !== undefined) {
        gaps.set(station, demand.get(station) ?? 0);
      }
    });
    if (gaps.size > 0) {
      return gaps;
    }
  }
  return new Map();
}

/** Every `size`-element subset of `items`, as sets. */
function combinations<T>(items: readonly T[], size: number): Set<T>[] {
  if (size === 0) {
    return [new Set()];
  }
  return items.flatMap((item, i) =>
    combinations(items.slice(i + 1), size - 1).map((rest) => new Set([item, ...rest])),
  );
}

/** Level event rules. Returns false when an event's story is missing or unsolvable. */
function checkEvents(
  level: Pick<LevelFile, 'id' | 'durationS' | 'layout' | 'stations' | 'events'>,
  storiesById: ReadonlyMap<string, Story>,
  report: Report,
): boolean {
  let ok = true;
  let conveyorTiles = 0;
  try {
    const map = parseLayout(level.layout);
    conveyorTiles = map.fixtures.filter((f) => f.kind === 'conveyor').length;
  } catch {
    // The layout error is already reported by the level schema.
  }

  const lastOfKind = new Map<string, number>();
  const outages: { atS: number; endS: number; station: StationKind }[] = [];
  level.events.forEach((event, i) => {
    const previousAt = lastOfKind.get(event.kind);
    if (previousAt !== undefined && event.atS - previousAt < EVENT_MIN_GAP_S) {
      report(
        ['events', i, 'atS'],
        'error',
        `"${event.kind}" events must be at least ${EVENT_MIN_GAP_S} s apart (previous at ${previousAt} s)`,
      );
    }
    lastOfKind.set(event.kind, event.atS);

    if (event.kind === 'outage') {
      outages.push({ atS: event.atS, endS: event.atS + event.durationS, station: event.station });
      const down = new Set(
        outages.filter((o) => o.atS <= event.atS && o.endS > event.atS).map((o) => o.station),
      );
      if (level.stations.every((station) => down.has(station))) {
        report(
          ['events', i],
          'warning',
          'every station is down during this outage; no one can stamp',
        );
      }
      return;
    }

    const story = storiesById.get(event.storyId);
    if (!story) {
      report(['events', i, 'storyId'], 'error', `unknown story "${event.storyId}"`);
      ok = false;
      return;
    }
    if (!checkStoryFitsLevel(story, level, ['events', i, 'storyId'], report)) {
      ok = false;
    }
    if (dueS(event.atS, event.deadlineS, story) > level.durationS) {
      report(['events', i, 'deadlineS'], 'warning', 'deadline runs past the end of the level');
    }
    if (event.kind === 'correction' && story.truth !== 'false' && story.truth !== 'misleading') {
      report(
        ['events', i, 'storyId'],
        'error',
        `a correction needs a false or misleading story, "${story.id}" is "${story.truth}"`,
      );
    }
    if (event.kind === 'botRaid' && event.count > conveyorTiles) {
      report(
        ['events', i, 'count'],
        'error',
        `bot raid of ${event.count} folders exceeds the ${conveyorTiles} conveyor tiles in the layout`,
      );
    }
  });
  return ok;
}

/**
 * Every content file on disk must be in the registry (src/files.ts) under its own path, and every
 * registry entry must exist on disk. `data` is set when the file on disk is valid JSON, so an
 * entry registered under the wrong path is caught by comparing contents.
 */
export function checkRegistration(
  onDisk: readonly { file: string; data?: unknown }[],
  registered: Readonly<Record<string, unknown>>,
): Issue[] {
  const issues: Issue[] = [];
  const error = (file: string, message: string) =>
    issues.push({ severity: 'error', file, path: '', message });
  const diskNames = new Set(onDisk.map((entry) => entry.file));
  for (const { file, data } of onDisk) {
    if (!Object.hasOwn(registered, file)) {
      error(file, 'not registered in src/files.ts, so the game never loads it');
    } else if (data !== undefined && JSON.stringify(registered[file]) !== JSON.stringify(data)) {
      error('src/files.ts', `"${file}" is registered with the contents of another file`);
    }
  }
  for (const file of Object.keys(registered)) {
    if (!diskNames.has(file)) {
      error('src/files.ts', `registers "${file}", which does not exist`);
    }
  }
  return issues;
}

/**
 * Encyclopedia rules (S5-04): every technique id a story uses resolves to exactly one card (its
 * id or an alias), ids and aliases are unique, and no card is left without a story.
 */
export function validateTechniques(
  techniqueFiles: readonly ContentFile[],
  storyFiles: readonly ContentFile[],
): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, file: string, path: readonly PathPart[], message: string) =>
    issues.push({ severity, file, path: formatPath(path), message });
  /** Technique id or alias to the card it collects into. */
  const owner = new Map<string, string>();
  const cards: { technique: Technique; file: string; index: number }[] = [];
  for (const { file, data } of techniqueFiles) {
    if (!Array.isArray(data)) {
      add('error', file, [], 'expected an array of techniques');
      continue;
    }
    data.forEach((entry: unknown, index) => {
      const parsed = techniqueSchema.safeParse(entry);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          add('error', file, [index, ...issue.path], issue.message);
        }
        return;
      }
      const technique = parsed.data;
      cards.push({ technique, file, index });
      for (const id of [technique.id, ...technique.aliases]) {
        const taken = owner.get(id);
        if (taken !== undefined) {
          add('error', file, [index, 'id'], `"${id}" already belongs to technique "${taken}"`);
        } else {
          owner.set(id, technique.id);
        }
      }
      for (const [field, value] of Object.entries(technique)) {
        if (typeof value === 'string') {
          checkTypography(value, [index, field], (path, severity, message) =>
            add(severity, file, path, message),
          );
        }
      }
    });
  }
  const used = new Set<string>();
  for (const { file, data } of storyFiles) {
    if (!Array.isArray(data)) {
      continue;
    }
    data.forEach((entry: unknown, index) => {
      const id = (entry as { technique?: unknown } | null)?.technique;
      if (typeof id !== 'string') {
        return;
      }
      const card = owner.get(id);
      if (card === undefined) {
        add('warning', file, [index, 'technique'], `technique "${id}" has no encyclopedia card`);
      } else {
        used.add(card);
      }
    });
  }
  for (const { technique, file, index } of cards) {
    if (!used.has(technique.id)) {
      add('warning', file, [index, 'id'], `technique "${technique.id}" is used by no story`);
    }
  }
  return issues;
}
