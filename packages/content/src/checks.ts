// Pure content checks: schema parsing plus the cross-file rules from agents/content-authoring.md
// (unique ids, schedules that reference existing stories, solvability with the level's
// stations, star thresholds within reach, Polish typography). No I/O here; validate.ts loads the
// files and prints the issues, tests feed fixtures directly.
import {
  CONTENT_THREE_STARS_SHARE,
  CONTENT_TRUE_STORY_SHARE,
  CONTENT_TWO_STARS_SHARE,
  EVENTS,
  parseLayout,
  SCORE,
  type StationKind,
} from '@redakcja/shared';
import type { z } from 'zod';
import {
  type Level,
  levelSchema,
  type Story,
  storySchema,
  type Technique,
  techniqueSchema,
} from './schema.ts';

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

/** Points for a correct verdict delivered with more than half the time left (design doc). */
export function maxStoryScore(story: Pick<Story, 'priority' | 'correctVerdict'>): number {
  const base =
    story.correctVerdict === 'publishWithContext'
      ? SCORE.correctWithContext
      : story.priority === 'normal'
        ? SCORE.correctNormal
        : SCORE.correctImportant;
  return base + SCORE.speedBonus;
}

/**
 * The best score a perfect team can reach on a level: scheduled stories plus what the events add.
 * A viral story scores like a normal one; a boss call adds its bonus for true stories; a bot raid
 * is one verdict, one result; a correction folder scores `correctionScore` when filed.
 */
export function maxLevelScore(level: Level, storiesById: ReadonlyMap<string, Story>): number {
  let total = 0;
  for (const spawn of level.schedule) {
    const story = storiesById.get(spawn.storyId);
    if (story) {
      total += maxStoryScore(story);
    }
  }
  for (const event of level.events) {
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

/** Same-kind level events closer than this (seconds) are reported. */
export const EVENT_MIN_GAP_S = 10;

/** Number in a content id: `l3-foo` → 3. */
export function levelNumberOf(id: string): number | undefined {
  const match = /^l(\d+)-/.exec(id);
  return match ? Number(match[1]) : undefined;
}

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
  const used = new Set<string>();
  /** Stations of every (parsed) level that schedules or spawns the story. */
  const hostStations = new Map<string, Set<StationKind>>();
  for (const { file, data } of levelFiles) {
    // Read story ids from the raw data too, so a level that fails the schema does not make its
    // stories look unused.
    for (const id of rawStoryIds(data)) {
      used.add(id);
    }
    const parsed = levelSchema.safeParse(data);
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
    checkTypography(level.title, ['title'], (path, severity, message) =>
      add(severity, file, path, message),
    );
    checkTypography(level.briefing, ['briefing'], (path, severity, message) =>
      add(severity, file, path, message),
    );
    checkLevel(level, storiesById, (path, severity, message) => add(severity, file, path, message));
    for (const id of [...level.schedule, ...level.events.filter((e) => e.kind !== 'outage')].map(
      (entry) => ('storyId' in entry ? entry.storyId : ''),
    )) {
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
  return issues;
}

function rawStoryIds(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const entries = (['schedule', 'events'] as const).flatMap((key) => {
    const list = (data as Record<string, unknown>)[key];
    return Array.isArray(list) ? list : [];
  });
  return entries.flatMap((spawn: unknown) =>
    typeof spawn === 'object' &&
    spawn !== null &&
    'storyId' in spawn &&
    typeof spawn.storyId === 'string'
      ? [spawn.storyId]
      : [],
  );
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

/** Rules a story must meet to be spawned in a level (scheduled or by an event). */
function checkStoryFitsLevel(
  story: Story,
  level: Level,
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
  // The AI scanner is never decisive alone, so it cannot make a story solvable.
  const solvable = story.justifyingStamps.some((id) => {
    const stamp = story.stamps.find((s) => s.id === id);
    return stamp !== undefined && stamp.station !== 'aiScanner' && stations.has(stamp.station);
  });
  if (!solvable) {
    const usable = [...stations].filter((station) => station !== 'aiScanner');
    report(
      path,
      'error',
      `story "${story.id}" is unsolvable: no justifying stamp comes from ${usable.join(', ')}`,
    );
  }
  return solvable;
}

function checkLevel(level: Level, storiesById: ReadonlyMap<string, Story>, report: Report): void {
  const levelNumber = levelNumberOf(level.id);
  const scheduled: Story[] = [];
  let broken = false;

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

  level.schedule.forEach((spawn, i) => {
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
    if (spawn.atS + spawn.deadlineS > level.durationS) {
      report(['schedule', i, 'deadlineS'], 'warning', 'deadline runs past the end of the level');
    }
  });

  if (!checkEvents(level, storiesById, report)) {
    broken = true;
  }

  const unique = [...new Map(scheduled.map((story) => [story.id, story])).values()];
  if (unique.length > 0) {
    const share = unique.filter((story) => story.truth === 'true').length / unique.length;
    const range = CONTENT_TRUE_STORY_SHARE;
    if (share < range.min || share > range.max) {
      report(
        ['schedule'],
        'warning',
        `${Math.round(share * 100)}% of stories are true; aim for ${range.min * 100}–${range.max * 100}%`,
      );
    }
  }

  // The maximum score is only meaningful once every scheduled story is known and solvable.
  if (broken) {
    return;
  }
  const max = maxLevelScore(level, storiesById);
  if (level.stars.three > max) {
    report(['stars', 'three'], 'error', `three stars need ${level.stars.three}, max is ${max}`);
  } else if (max > 0) {
    const twoTooHigh = level.stars.two > max * 0.9;
    if (twoTooHigh) {
      report(
        ['stars', 'two'],
        'warning',
        `two stars need ${level.stars.two}, over 90% of the max score ${max}`,
      );
    }
    const ranges = [
      ['two', level.stars.two, CONTENT_TWO_STARS_SHARE],
      ['three', level.stars.three, CONTENT_THREE_STARS_SHARE],
    ] as const;
    for (const [key, threshold, range] of ranges) {
      if (key === 'two' && twoTooHigh) {
        continue;
      }
      const share = threshold / max;
      if (share < range.min || share > range.max) {
        report(
          ['stars', key],
          'warning',
          `${key} stars at ${Math.round(share * 100)}% of the max score ${max}; aim for ${range.min * 100}–${range.max * 100}%`,
        );
      }
    }
  }
}

/** Level event rules. Returns false when an event's story is missing or unsolvable. */
function checkEvents(
  level: Level,
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
    if (event.atS + event.deadlineS > level.durationS) {
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
