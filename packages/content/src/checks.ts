// Pure content checks: schema parsing plus the cross-file rules from agents/content-authoring.md
// (unique ids, schedules that reference existing stories, solvability with the level's
// stations, star thresholds within reach, Polish typography). No I/O here; validate.ts loads the
// files and prints the issues, tests feed fixtures directly.
import {
  CONTENT_THREE_STARS_SHARE,
  CONTENT_TRUE_STORY_SHARE,
  CONTENT_TWO_STARS_SHARE,
  SCORE,
  type StationKind,
} from '@redakcja/shared';
import type { z } from 'zod';
import { type Level, levelSchema, type Story, storySchema } from './schema.ts';

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

/** The best score a perfect team can reach on a level. */
export function maxLevelScore(level: Level, storiesById: ReadonlyMap<string, Story>): number {
  let total = 0;
  for (const spawn of level.schedule) {
    const story = storiesById.get(spawn.storyId);
    if (story) {
      total += maxStoryScore(story);
    }
  }
  return total;
}

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
  for (const { file, data } of levelFiles) {
    // Read story ids from the raw data too, so a level that fails the schema does not make its
    // stories look unused.
    for (const id of rawScheduleIds(data)) {
      used.add(id);
    }
    const parsed = levelSchema.safeParse(data);
    if (!parsed.success) {
      addZod(file, [], parsed.error);
      continue;
    }
    const level = parsed.data;
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
  }

  for (const [id, { file, index }] of stories) {
    if (!used.has(id)) {
      add('warning', file, [index, 'id'], `story "${id}" is not scheduled in any level`);
    }
  }
  return issues;
}

function rawScheduleIds(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  // Stories spawned by level events count as used too.
  const lists = [
    ('schedule' in data && data.schedule) || [],
    ('events' in data && data.events) || [],
  ];
  return lists.flatMap((list) =>
    Array.isArray(list)
      ? list.flatMap((spawn: unknown) =>
          typeof spawn === 'object' &&
          spawn !== null &&
          'storyId' in spawn &&
          typeof spawn.storyId === 'string'
            ? [spawn.storyId]
            : [],
        )
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

function checkLevel(level: Level, storiesById: ReadonlyMap<string, Story>, report: Report): void {
  const levelNumber = levelNumberOf(level.id);
  const stations = new Set<StationKind>(level.stations);
  const scheduled: Story[] = [];
  let broken = false;

  level.schedule.forEach((spawn, i) => {
    const story = storiesById.get(spawn.storyId);
    if (!story) {
      report(['schedule', i, 'storyId'], 'error', `unknown story "${spawn.storyId}"`);
      broken = true;
      return;
    }
    scheduled.push(story);
    const storyNumber = levelNumberOf(story.id);
    if (storyNumber !== levelNumber) {
      report(
        ['schedule', i, 'storyId'],
        'error',
        `story "${story.id}" belongs to level ${storyNumber}, not level ${levelNumber}`,
      );
    }
    const stampStations = new Set(story.stamps.map((stamp) => stamp.station));
    for (const station of level.stations) {
      if (!stampStations.has(station)) {
        report(
          ['schedule', i, 'storyId'],
          'error',
          `story "${story.id}" has no stamp for station "${station}"`,
        );
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
        ['schedule', i, 'storyId'],
        'error',
        `story "${story.id}" is unsolvable: no justifying stamp comes from ${usable.join(', ')}`,
      );
      broken = true;
    }
    if (spawn.atS + spawn.deadlineS > level.durationS) {
      report(['schedule', i, 'deadlineS'], 'warning', 'deadline runs past the end of the level');
    }
  });

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
    const ranges = [
      ['two', level.stars.two, CONTENT_TWO_STARS_SHARE],
      ['three', level.stars.three, CONTENT_THREE_STARS_SHARE],
    ] as const;
    for (const [key, threshold, range] of ranges) {
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
