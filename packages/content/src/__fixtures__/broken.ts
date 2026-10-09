// Broken content for checks.test.ts: each case takes a fresh copy of the real greybox content,
// breaks exactly one rule and names the issue the validator must report.
// The JSON files in ./broken/ are the same idea on disk, for the validate.ts CLI.
import l0Level from '../../levels/l0-greybox.json';
import l0Stories from '../../stories/l0-greybox.json';
import type { ContentFile, Issue } from '../checks.ts';
import { type Level, levelSchema, type Story, storyFileSchema } from '../schema.ts';

export const LEVEL_FILE = 'levels/l0-greybox.json';
export const STORY_FILE = 'stories/l0-greybox.json';

export type Content = { level: Level; stories: Story[]; extraStories?: Story[] };

/** A deep copy of the real greybox content, safe to mutate. */
export function realContent(): Content {
  return {
    level: structuredClone(levelSchema.parse(l0Level)),
    stories: structuredClone(storyFileSchema.parse(l0Stories)),
  };
}

export function toFiles(content: Content): { levels: ContentFile[]; stories: ContentFile[] } {
  const stories: ContentFile[] = [{ file: STORY_FILE, data: content.stories }];
  if (content.extraStories) {
    stories.push({ file: 'stories/extra.json', data: content.extraStories });
  }
  return { levels: [{ file: LEVEL_FILE, data: content.level }], stories };
}

function story(content: Content, id: string): Story {
  const found = content.stories.find((s) => s.id === id);
  if (!found) {
    throw new Error(`fixture story ${id} missing`);
  }
  return found;
}

export type BrokenCase = {
  name: string;
  breakIt: (content: Content) => void;
  expected: Issue;
};

export const BROKEN_CASES: readonly BrokenCase[] = [
  {
    name: 'wrong correctVerdict',
    breakIt: (c) => {
      story(c, 'l0-zalany-rynek').correctVerdict = 'publish';
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[0].correctVerdict',
      message: 'truth "misleading" requires verdict "publishWithContext"',
    },
  },
  {
    name: 'unknown justifying stamp',
    breakIt: (c) => {
      story(c, 'l0-nocny-autobus').justifyingStamps = ['l0-nie-ma-takiej'];
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[1].justifyingStamps[0]',
      message: 'unknown stamp "l0-nie-ma-takiej"',
    },
  },
  {
    name: 'justifying stamp that is not decisive',
    breakIt: (c) => {
      story(c, 'l0-zalany-rynek').justifyingStamps.push('l0-zalany-rynek-source');
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[0].justifyingStamps[2]',
      message: 'justifying stamp "l0-zalany-rynek-source" must be decisive, not "irrelevant"',
    },
  },
  {
    name: 'schedule references a missing story',
    breakIt: (c) => {
      const spawn = c.level.schedule[1];
      if (spawn) {
        spawn.storyId = 'l0-nie-istnieje';
      }
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'schedule[1].storyId',
      message: 'unknown story "l0-nie-istnieje"',
    },
  },
  {
    name: 'story unsolvable with the level stations',
    breakIt: (c) => {
      c.level.stations = ['imageSearch', 'archive'];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'schedule[1].storyId',
      message:
        'story "l0-nocny-autobus" is unsolvable: no justifying stamp comes from imageSearch, archive',
    },
  },
  {
    name: 'story that only the AI scanner can solve in the level',
    breakIt: (c) => {
      c.level.layout = c.level.layout.map((row, y) => (y === 1 ? `${row.slice(0, -2)}S#` : row));
      c.level.stations = ['imageSearch', 'sourceRegistry', 'aiScanner'];
      const s = story(c, 'l0-nocny-autobus');
      s.stamps = s.stamps.map((stamp) =>
        stamp.station === 'archive' ? { ...stamp, relevance: 'decisive' } : stamp,
      );
      s.stamps.push({
        id: 'l0-nocny-autobus-ai',
        station: 'aiScanner',
        text: 'Grafika z rozkładem: 12% szans, że to obraz generowany.',
        relevance: 'decisive',
      });
      s.justifyingStamps = ['l0-nocny-autobus-ai', 'l0-nocny-autobus-archive'];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'schedule[1].storyId',
      message:
        'story "l0-nocny-autobus" is unsolvable: no justifying stamp comes from imageSearch, sourceRegistry',
    },
  },
  {
    name: 'story without a stamp for a level station',
    breakIt: (c) => {
      const s = story(c, 'l0-nocny-autobus');
      s.stamps = s.stamps.filter((stamp) => stamp.station !== 'archive');
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'schedule[1].storyId',
      message: 'story "l0-nocny-autobus" has no stamp for station "archive"',
    },
  },
  {
    name: 'unsorted schedule',
    breakIt: (c) => {
      const first = c.level.schedule[0];
      if (first) {
        first.atS = 50;
      }
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'schedule[1]',
      message: 'schedule must be sorted',
    },
  },
  {
    name: 'story id prefix does not match the level',
    breakIt: (c) => {
      story(c, 'l0-nocny-autobus').id = 'l1-nocny-autobus';
      const spawn = c.level.schedule[1];
      if (spawn) {
        spawn.storyId = 'l1-nocny-autobus';
      }
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'schedule[1].storyId',
      message: 'story "l1-nocny-autobus" belongs to level 1, not level 0',
    },
  },
  {
    name: 'duplicate story id across files',
    breakIt: (c) => {
      c.extraStories = [story(c, 'l0-zalany-rynek')];
    },
    expected: {
      severity: 'error',
      file: 'stories/extra.json',
      path: '[0].id',
      message: 'duplicate story id "l0-zalany-rynek" (first in stories/l0-greybox.json)',
    },
  },
  {
    name: 'three stars above the maximum score',
    breakIt: (c) => {
      c.level.stars.three = 1000;
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'stars.three',
      message: 'three stars need 1000, max is 240',
    },
  },
  {
    name: 'straight quotes in player-facing text',
    breakIt: (c) => {
      story(c, 'l0-nocny-autobus').headline = 'Nowa linia "N3" od poniedziałku';
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[1].headline',
      message: 'use Polish quotes „…” instead of straight quotes',
    },
  },
  {
    name: 'true story with a manipulation technique',
    breakIt: (c) => {
      story(c, 'l0-nocny-autobus').technique = 'stare-zdjecie-nowy-podpis';
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[1].technique',
      message: 'a true story has technique "none"',
    },
  },
  {
    name: 'AI scanner stamp that is decisive without another justifying stamp',
    breakIt: (c) => {
      const s = story(c, 'l0-nocny-autobus');
      s.stamps.push({
        id: 'l0-nocny-autobus-ai',
        station: 'aiScanner',
        text: 'Tekst z 91% szans na wygenerowanie przez model.',
        relevance: 'decisive',
      });
      s.justifyingStamps = ['l0-nocny-autobus-ai'];
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[1].stamps[3].relevance',
      message:
        'an AI scanner stamp may only be decisive next to a justifying stamp from another station',
    },
  },
  {
    name: 'story justified by the AI scanner alone',
    breakIt: (c) => {
      const s = story(c, 'l0-nocny-autobus');
      s.stamps.push({
        id: 'l0-nocny-autobus-ai',
        station: 'aiScanner',
        text: 'Tekst z 91% szans na wygenerowanie przez model.',
        relevance: 'decisive',
      });
      s.justifyingStamps = ['l0-nocny-autobus-ai'];
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[1].justifyingStamps',
      message: 'an AI scanner stamp must never be decisive alone',
    },
  },
  {
    name: 'stamp from a station that no level scheduling the story has',
    breakIt: (c) => {
      story(c, 'l0-nocny-autobus').stamps.push({
        id: 'l0-nocny-autobus-phone',
        station: 'phone',
        text: 'Rzecznik potwierdza nową linię.',
        relevance: 'irrelevant',
      });
    },
    expected: {
      severity: 'error',
      file: STORY_FILE,
      path: '[1].stamps[3].station',
      message:
        'stamp "l0-nocny-autobus-phone" uses station "phone", which no level scheduling this story has',
    },
  },
  {
    name: 'event with an unknown story',
    breakIt: (c) => {
      c.level.events = [{ kind: 'viral', atS: 30, storyId: 'l0-nie-istnieje', deadlineS: 60 }];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'events[0].storyId',
      message: 'unknown story "l0-nie-istnieje"',
    },
  },
  {
    name: 'event story unsolvable with the level stations',
    breakIt: (c) => {
      c.level.stations = ['imageSearch', 'archive'];
      c.level.schedule = [{ atS: 3, storyId: 'l0-zalany-rynek', deadlineS: 90 }];
      c.level.events = [{ kind: 'viral', atS: 30, storyId: 'l0-nocny-autobus', deadlineS: 60 }];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'events[0].storyId',
      message:
        'story "l0-nocny-autobus" is unsolvable: no justifying stamp comes from imageSearch, archive',
    },
  },
  {
    name: 'correction on a true story',
    breakIt: (c) => {
      c.level.events = [
        { kind: 'correction', atS: 100, storyId: 'l0-nocny-autobus', deadlineS: 60 },
      ];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'events[0].storyId',
      message: 'a correction needs a false or misleading story, "l0-nocny-autobus" is "true"',
    },
  },
  {
    name: 'bot raid larger than the conveyor',
    breakIt: (c) => {
      c.level.events = [
        { kind: 'botRaid', atS: 100, storyId: 'l0-falszywa-straz', deadlineS: 60, count: 5 },
      ];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'events[0].count',
      message: 'bot raid of 5 folders exceeds the 4 conveyor tiles in the layout',
    },
  },
  {
    name: 'outage of a station the level does not have',
    breakIt: (c) => {
      c.level.events = [{ kind: 'outage', atS: 100, station: 'phone', durationS: 20 }];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'events[0].station',
      message: 'station "phone" is not in this level',
    },
  },
  {
    name: 'two events of the same kind within 10 s',
    breakIt: (c) => {
      c.level.events = [
        { kind: 'viral', atS: 100, storyId: 'l0-zalany-rynek', deadlineS: 60 },
        { kind: 'viral', atS: 109, storyId: 'l0-falszywa-straz', deadlineS: 60 },
      ];
    },
    expected: {
      severity: 'error',
      file: LEVEL_FILE,
      path: 'events[1].atS',
      message: '"viral" events must be at least 10 s apart (previous at 100 s)',
    },
  },
  {
    name: 'outage in a level with a single station (warning only)',
    breakIt: (c) => {
      const hasSource = (s: Story) =>
        s.stamps.some((x) => x.station === 'sourceRegistry' && s.justifyingStamps.includes(x.id));
      const solvable = new Set(c.stories.filter(hasSource).map((s) => s.id));
      for (const s of c.stories.filter((x) => solvable.has(x.id))) {
        s.stamps = s.stamps.filter((x) => x.station === 'sourceRegistry');
        s.justifyingStamps = s.justifyingStamps.filter((id) => s.stamps.some((x) => x.id === id));
      }
      c.level.stations = ['sourceRegistry'];
      c.level.schedule = c.level.schedule.filter((spawn) => solvable.has(spawn.storyId));
      c.level.events = [{ kind: 'outage', atS: 100, station: 'sourceRegistry', durationS: 20 }];
      c.level.stars = { two: 40, three: 70 };
    },
    expected: {
      severity: 'warning',
      file: LEVEL_FILE,
      path: 'events[0]',
      message: 'every station is down during this outage; no one can stamp',
    },
  },
  {
    name: 'two stars above 90% of the maximum score (warning only)',
    breakIt: (c) => {
      c.level.stars = { two: 230, three: 238 };
    },
    expected: {
      severity: 'warning',
      file: LEVEL_FILE,
      path: 'stars.two',
      message: 'two stars need 230, over 90% of the max score 240',
    },
  },
  {
    name: 'too many true stories (warning only)',
    breakIt: (c) => {
      const truths = new Map(c.stories.map((s) => [s.id, s.truth]));
      c.level.schedule = c.level.schedule.filter((spawn) => truths.get(spawn.storyId) === 'true');
      c.level.stars = { two: 40, three: 70 };
    },
    expected: {
      severity: 'warning',
      file: LEVEL_FILE,
      path: 'schedule',
      message: '100% of stories are true; aim for 25–45%',
    },
  },
];
