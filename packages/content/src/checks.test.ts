import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BAG_OPENING_SLOTS,
  correctVerdictFor,
  DIFFICULTIES,
  EVENTS,
  parseLayout,
  STAR_SHARES,
  STATION_KINDS,
} from '@redakcja/shared';
import {
  type BagContent,
  bagContent,
  FIXTURE_BAG,
  thinBagContent,
} from './__fixtures__/bag-level.ts';
import { BROKEN_CASES, realContent, toFiles } from './__fixtures__/broken.ts';
import {
  bagSlotTimes,
  decidingStations,
  generateBagLevel,
  isPinned,
  pinnedCounts,
  starThresholds,
} from './bag.ts';
import {
  checkBag,
  checkEndlessDecks,
  checkLayout,
  checkRegistration,
  ENDLESS_ISSUE_FILE,
  formatIssue,
  maxLevelScore,
  maxStoryScore,
  proofCount,
  validateContent,
  validateTechniques,
} from './checks.ts';
import { ENDLESS_LAYOUT } from './endless.ts';
import { LEVEL_FILES, STORY_FILES } from './files.ts';
import { LEVELS, STORIES } from './index.ts';
import { type LevelBag, type LevelFile, levelFileSchema, storySchema } from './schema.ts';

const packageRoot = resolve(import.meta.dir, '..');

function contentFilesOnDisk(): { file: string; data: unknown }[] {
  return (['levels', 'stories'] as const).flatMap((dir) =>
    readdirSync(join(packageRoot, dir))
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({
        file: `${dir}/${name}`,
        data: JSON.parse(readFileSync(join(packageRoot, dir, name), 'utf8')),
      })),
  );
}

describe('validateContent', () => {
  it('accepts the real content without errors or warnings', () => {
    const { levels, stories } = toFiles(realContent());
    expect(validateContent(levels, stories)).toEqual([]);
  });

  for (const broken of BROKEN_CASES) {
    it(`reports ${broken.name}`, () => {
      const content = realContent();
      broken.breakIt(content);
      const { levels, stories } = toFiles(content);
      const issues = validateContent(levels, stories);
      expect(issues).toContainEqual(broken.expected);
      if (broken.expected.severity === 'warning') {
        expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
      }
    });
  }

  it('reports a story file that is not an array', () => {
    expect(validateContent([], [{ file: 'stories/x.json', data: {} }])).toEqual([
      {
        severity: 'error',
        file: 'stories/x.json',
        path: '',
        message: 'expected an array of stories',
      },
    ]);
  });
});

describe('campaign level rules', () => {
  const l1 = LEVELS.find((l) => l.id === 'l1-burza');
  const l1Stories = STORIES.filter((s) => s.id.startsWith('l1-'));

  it('warns when a campaign level has no topic or briefing points', () => {
    const file = levelFileSchema.parse(LEVEL_FILES['levels/l1-burza.json']);
    const { topic: _topic, briefingPoints: _points, ...rest } = file;
    const issues = validateContent(
      [{ file: 'levels/l1-burza.json', data: rest }],
      [{ file: 'stories/l1-burza.json', data: l1Stories }],
    );
    // Level 1 alone leaves most endless decks empty; that warning has its own tests.
    const ownIssues = issues.filter((issue) => issue.file !== ENDLESS_ISSUE_FILE);
    expect(ownIssues.map((i) => [i.severity, i.path])).toEqual([
      ['warning', 'topic'],
      ['warning', 'briefingPoints'],
    ]);
  });

  it('counts event stories and bonuses in the maximum score', () => {
    if (!l1) {
      throw new Error('level 1 missing');
    }
    const byId = new Map(STORIES.map((s) => [s.id, s]));
    const base = maxLevelScore(l1, byId);
    const trueStory = l1Stories.find((s) => s.truth === 'true');
    const falseStory = l1Stories.find((s) => s.truth === 'false');
    if (!trueStory || !falseStory) {
      throw new Error('level 1 needs a true and a false story');
    }
    const withEvents = {
      ...l1,
      events: [
        { kind: 'bossCall' as const, atS: 10, storyId: trueStory.id, deadlineS: 30 },
        { kind: 'correction' as const, atS: 50, storyId: falseStory.id, deadlineS: 30 },
        { kind: 'outage' as const, atS: 90, station: 'imageSearch' as const, durationS: 20 },
      ],
    };
    expect(maxLevelScore(withEvents, byId)).toBe(
      base + maxStoryScore(trueStory) + EVENTS.bossCallBonusScore + EVENTS.correctionScore,
    );
  });
});

describe('multi-stamp stories (S7-18)', () => {
  it('adds the multi-stamp bonus for every proof beyond the first to the best score', () => {
    expect(maxStoryScore({ priority: 'normal', correctVerdict: 'publish' })).toBe(15);
    expect(
      maxStoryScore({ priority: 'important', correctVerdict: 'reject', requiredStamps: 1 }),
    ).toBe(25);
    expect(
      maxStoryScore({ priority: 'important', correctVerdict: 'reject', requiredStamps: 2 }),
    ).toBe(35);
    expect(
      maxStoryScore({
        priority: 'normal',
        correctVerdict: 'publishWithContext',
        requiredStamps: 3,
      }),
    ).toBe(55);
  });

  it('counts the bonus in the level maximum', () => {
    const content = realContent();
    const flood = content.stories.find((s) => s.id === 'l0-zalany-rynek');
    if (!flood) {
      throw new Error('greybox story l0-zalany-rynek missing');
    }
    flood.requiredStamps = 2;
    const byId = new Map(content.stories.map((s) => [s.id, s]));
    expect(maxLevelScore(content.level, byId)).toBe(250);
  });

  it('counts distinct proofs from the given stations, never a hint-only stamp', () => {
    const story = {
      stamps: [
        { id: 'image', station: 'imageSearch' as const },
        { id: 'archive', station: 'archive' as const },
        { id: 'ai', station: 'aiScanner' as const },
        { id: 'phone', station: 'phone' as const },
      ],
      justifyingStamps: ['image', 'archive', 'ai', 'phone', 'image'],
    };
    expect(proofCount(story, ['imageSearch', 'archive', 'aiScanner', 'phone'])).toBe(3);
    expect(proofCount(story, ['imageSearch', 'sourceRegistry'])).toBe(1);
    expect(proofCount(story, ['aiScanner'])).toBe(0);
    expect(
      proofCount({ ...story, justifyingStamps: ['ai', 'phone'] }, ['aiScanner', 'phone']),
    ).toBe(1);
  });
});

describe('story stamps (S7-48: ten station kinds)', () => {
  const base = STORIES.find((story) => story.id === 'l0-zalany-rynek');
  const stampFor = (station: string, i: number) => ({
    id: `l0-zalany-rynek-${i}`,
    station,
    text: 'Pieczątka testowa.',
    relevance: i === 0 ? 'decisive' : 'irrelevant',
  });

  it('accepts one stamp for each of the 10 station kinds', () => {
    expect(STATION_KINDS).toHaveLength(10);
    const stamps = STATION_KINDS.map(stampFor);
    const result = storySchema.safeParse({
      ...base,
      stamps,
      justifyingStamps: ['l0-zalany-rynek-0'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an eleventh stamp', () => {
    const stamps = [...STATION_KINDS.map(stampFor), stampFor('imageSearch', 10)];
    const result = storySchema.safeParse({
      ...base,
      stamps,
      justifyingStamps: ['l0-zalany-rynek-0'],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.code === 'too_big')).toBe(true);
  });
});

describe('greybox content (S7-27: a station bag)', () => {
  const file = levelFileSchema.parse(LEVEL_FILES['levels/l0-greybox.json']);
  const pool = STORIES.filter((s) => file.bag?.pool.includes(s.id));
  const stations = file.stations;

  it('deals from a bag of 17 stories that cover every truth value and priority', () => {
    expect(file.schedule).toBeUndefined();
    expect(file.bag).toMatchObject({
      firstAtS: 3,
      gapS: 18,
      lastSpawnS: 175,
      deadlineS: { normal: 75, important: 90, urgent: 50 },
      starShares: { two: 0.5, three: 0.8 },
    });
    expect(pool).toHaveLength(17);
    expect(new Set(pool.map((s) => s.truth))).toEqual(
      new Set(['true', 'false', 'misleading', 'satire', 'unverifiable']),
    );
    expect(new Set(pool.map((s) => s.priority))).toEqual(
      new Set(['normal', 'important', 'urgent']),
    );
    const unverifiable = pool.filter((s) => s.truth === 'unverifiable');
    expect(unverifiable.some((s) => s.priority === 'urgent')).toBe(true);
    expect(unverifiable.some((s) => s.priority !== 'urgent')).toBe(true);
    expect(new Set(pool.map((s) => s.type)).size).toBeGreaterThanOrEqual(5);
    expect(pool.filter((s) => s.truth === 'true')).toHaveLength(6);
  });

  it('gives every story one stamp per level station, a matching verdict and one proof', () => {
    for (const story of pool) {
      const kinds: string[] = story.stamps.map((s) => s.station).sort();
      expect(kinds).toEqual(['archive', 'imageSearch', 'sourceRegistry']);
      expect(story.correctVerdict).toBe(correctVerdictFor(story.truth, story.priority));
      expect(story.requiredStamps).toBe(1);
      expect(story.reviewed).toBe(false);
    }
  });

  it('pins at least ⌈10 Normal folders / 3 stations⌉ = 4 stories to every station', () => {
    expect(bagSlotTimes(bagOfFile(file), 'normal')).toHaveLength(10);
    expect(Object.fromEntries(pinnedCounts(pool, stations))).toEqual({
      imageSearch: 4,
      archive: 4,
      sourceRegistry: 5,
    });
  });

  it('deals 8 / 10 / 11 / 12 distinct folders on easy / normal / hard / expert', () => {
    const counts = DIFFICULTIES.map((difficulty) => {
      const run = generateBagLevel(file, STORIES, 7, difficulty);
      const ids = run.schedule.map((spawn) => spawn.storyId);
      expect(new Set(ids).size).toBe(ids.length);
      return ids.length;
    });
    expect(counts).toEqual([8, 10, 11, 12]);
  });

  it('opens the preview with single-proof, non-urgent folders and stars at 50% / 80%', () => {
    const level = LEVELS.find((l) => l.id === 'l0-greybox');
    if (!level) {
      throw new Error('greybox level missing');
    }
    expect(level.schedule.slice(0, 2).map((spawn) => spawn.atS)).toEqual([3, 21]);
    for (const spawn of level.schedule.slice(0, BAG_OPENING_SLOTS)) {
      expect(pool.find((s) => s.id === spawn.storyId)?.priority).not.toBe('urgent');
    }
    const max = maxLevelScore(level, new Map(STORIES.map((s) => [s.id, s])));
    expect(level.stars).toEqual(starThresholds(max, { two: 0.5, three: 0.8 }));
    expect({ max, stars: level.stars }).toEqual({ max: 240, stars: { two: 120, three: 190 } });
  });
});

/** The bag of a level file that must have one. */
function bagOfFile(file: LevelFile): LevelBag {
  if (!file.bag) {
    throw new Error(`${file.id} has no bag`);
  }
  return file.bag;
}

describe('level 1 content', () => {
  const file = levelFileSchema.parse(LEVEL_FILES['levels/l1-burza.json']);
  const byId = new Map(STORIES.map((s) => [s.id, s]));
  const pool = (file.bag?.pool ?? []).flatMap((id) => byId.get(id) ?? []);
  const newStories = [
    'l1-tecza-nad-portem',
    'l1-zerwany-dach-hali',
    'l1-rekin-na-ulicy',
    'l1-zerwany-most',
    'l1-grad-jak-jajka',
  ];

  it('deals from a bag of 20 stories for the image search and source registry only', () => {
    expect(file.stations).toEqual(['imageSearch', 'sourceRegistry']);
    expect(file.schedule).toBeUndefined();
    expect(file.stars).toBeUndefined();
    expect(file.bag).toEqual({
      pool: file.bag?.pool ?? [],
      firstAtS: 4,
      gapS: 22,
      lastSpawnS: 312,
      deadlineS: { normal: 55, important: 60, urgent: 40 },
      starShares: { two: 0.55, three: 0.85 },
    });
    expect(pool).toHaveLength(20);
    expect(pool.map((s) => s.id)).toEqual(expect.arrayContaining(newStories));
    expect(new Set(pool.map((s) => s.priority))).toEqual(
      new Set(['normal', 'important', 'urgent']),
    );
    const techniques = new Set(pool.map((s) => s.technique));
    expect(techniques).toContain('stare-zdjecie-nowy-podpis');
    expect(techniques).toContain('podszywanie-sie-pod-instytucje');
    expect(pool.some((s) => s.truth === 'unverifiable' && s.priority === 'urgent')).toBe(true);
    expect(pool.filter((s) => s.truth === 'true')).toHaveLength(7);
  });

  it('gives every story one stamp per level station and a matching verdict', () => {
    for (const story of pool) {
      const stations: string[] = story.stamps.map((s) => s.station).sort();
      expect(stations).toEqual(['imageSearch', 'sourceRegistry']);
      expect(story.correctVerdict).toBe(correctVerdictFor(story.truth, story.priority));
      expect(story.reviewed).toBe(false);
    }
  });

  it('pins the five new stories to the image search, 8 pinned stories per station', () => {
    for (const id of newStories) {
      const story = byId.get(id);
      if (!story) {
        throw new Error(`story ${id} missing`);
      }
      expect(decidingStations(story, file.stations)).toEqual(['imageSearch']);
      expect(isPinned(story, file.stations)).toBe(true);
    }
    expect(pinnedCounts(pool, file.stations)).toEqual(
      new Map([
        ['imageSearch', 8],
        ['sourceRegistry', 8],
      ]),
    );
  });

  it('passes the bag checks with no issue: 12, 15, 16 and 18 folders by difficulty', () => {
    const bag = file.bag;
    if (!bag) {
      throw new Error('level 1 has no bag');
    }
    expect(DIFFICULTIES.map((d) => bagSlotTimes(bag, d).length)).toEqual([12, 15, 16, 18]);
    const issues: string[] = [];
    checkBag({ ...file, bag }, byId, (path, severity, message) =>
      issues.push(`${severity} ${path.join('.')}: ${message}`),
    );
    expect(issues).toEqual([]);
  });

  it('ends every dealt folder with the level and takes the stars from the 55 % / 85 % shares', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 7, 0xffffffff]) {
        const level = generateBagLevel(file, STORIES, seed, difficulty);
        const ids = level.schedule.map((spawn) => spawn.storyId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const spawn of level.schedule) {
          expect(spawn.atS + spawn.deadlineS).toBeLessThanOrEqual(file.durationS);
        }
        expect(level.stars).toEqual(
          starThresholds(maxLevelScore(level, byId), { two: 0.55, three: 0.85 }),
        );
      }
    }
  });
});

describe('level 2 content', () => {
  const file = levelFileSchema.parse(LEVEL_FILES['levels/l2-wybory.json']);
  const byId = new Map(STORIES.map((s) => [s.id, s]));
  const pool = (file.bag?.pool ?? []).flatMap((id) => byId.get(id) ?? []);
  const newStories = ['l2-debata-w-liceum', 'l2-plaza-w-kampanii', 'l2-wycinka-w-parku'];

  it('is registered with the Archiwum and the three-station layout', () => {
    expect(file.stations).toEqual(['imageSearch', 'archive', 'sourceRegistry']);
    expect(parseLayout(file.layout).spawns).toHaveLength(4);
    expect(file.events).toEqual([]);
  });

  it('deals from a bag of 18 stories, 6 of them true', () => {
    expect(file.schedule).toBeUndefined();
    expect(file.stars).toBeUndefined();
    expect(file.bag).toEqual({
      pool: file.bag?.pool ?? [],
      firstAtS: 4,
      gapS: 24,
      lastSpawnS: 340,
      deadlineS: { normal: 55, important: 60, urgent: 45 },
    });
    expect(pool).toHaveLength(18);
    expect(pool.map((s) => s.id)).toEqual(expect.arrayContaining(newStories));
    // Every level 2 story is dealt from the pool, so none stays unscheduled.
    const levelStories = STORIES.filter((s) => s.id.startsWith('l2-')).map((s) => s.id);
    expect(new Set(file.bag?.pool)).toEqual(new Set(levelStories));
    expect(pool.filter((s) => s.truth === 'true')).toHaveLength(6);
    for (const story of pool) {
      const stations: string[] = story.stamps.map((s) => s.station).sort();
      expect(stations).toEqual(['archive', 'imageSearch', 'sourceRegistry']);
      expect(story.correctVerdict).toBe(correctVerdictFor(story.truth, story.priority));
    }
  });

  it('uses publishWithContext for at least a quarter of its pool (6 of 18)', () => {
    const withContext = pool.filter((s) => s.correctVerdict === 'publishWithContext');
    expect(withContext).toHaveLength(6);
    expect(withContext.length / pool.length).toBeGreaterThanOrEqual(0.25);
  });

  it('pins the three new photo stories to the image search, at least 5 per station', () => {
    for (const id of newStories) {
      const story = byId.get(id);
      if (!story) {
        throw new Error(`story ${id} missing`);
      }
      expect(story.type).toBe('photo');
      expect(story.reviewed).toBe(false);
      expect(decidingStations(story, file.stations)).toEqual(['imageSearch']);
      expect(isPinned(story, file.stations)).toBe(true);
    }
    expect(pinnedCounts(pool, file.stations)).toEqual(
      new Map([
        ['imageSearch', 5],
        ['archive', 5],
        ['sourceRegistry', 6],
      ]),
    );
  });

  it('passes the bag checks with no issue: 12, 15, 16 and 18 folders by difficulty', () => {
    const bag = file.bag;
    if (!bag) {
      throw new Error('level 2 has no bag');
    }
    expect(DIFFICULTIES.map((d) => bagSlotTimes(bag, d).length)).toEqual([12, 15, 16, 18]);
    const issues: string[] = [];
    checkBag({ ...file, bag }, byId, (path, severity, message) =>
      issues.push(`${severity} ${path.join('.')}: ${message}`),
    );
    expect(issues).toEqual([]);
  });

  it('ends every dealt folder with the level and takes the stars from the default shares', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 7, 0xffffffff]) {
        const level = generateBagLevel(file, STORIES, seed, difficulty);
        const ids = level.schedule.map((spawn) => spawn.storyId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const spawn of level.schedule) {
          expect(spawn.atS + spawn.deadlineS).toBeLessThanOrEqual(file.durationS);
        }
        expect(level.stars).toEqual(starThresholds(maxLevelScore(level, byId), STAR_SHARES));
      }
    }
    const preview = LEVELS.find((l) => l.id === 'l2-wybory');
    expect(preview?.schedule).toHaveLength(15);
    expect(preview?.stars).toEqual({ two: 210, three: 310 });
  });
});

describe('registration', () => {
  it('registers every content file on disk under its own path', () => {
    expect(checkRegistration(contentFilesOnDisk(), { ...LEVEL_FILES, ...STORY_FILES })).toEqual([]);
  });

  it('reports files on disk that src/files.ts does not register', () => {
    expect(
      checkRegistration(
        [
          { file: 'levels/a.json', data: { a: 1 } },
          { file: 'stories/l9-nowe.json', data: [] },
        ],
        { 'levels/a.json': { a: 1 } },
      ),
    ).toEqual([
      {
        severity: 'error',
        file: 'stories/l9-nowe.json',
        path: '',
        message: 'not registered in src/files.ts, so the game never loads it',
      },
    ]);
  });

  it('reports registry entries with the wrong contents or no file', () => {
    expect(
      checkRegistration([{ file: 'levels/a.json', data: { a: 1 } }], {
        'levels/a.json': { b: 2 },
        'levels/gone.json': {},
      }),
    ).toEqual([
      {
        severity: 'error',
        file: 'src/files.ts',
        path: '',
        message: '"levels/a.json" is registered with the contents of another file',
      },
      {
        severity: 'error',
        file: 'src/files.ts',
        path: '',
        message: 'registers "levels/gone.json", which does not exist',
      },
    ]);
  });
});

describe('layout checks (checkLayout, S7-50)', () => {
  type Found = { path: string; severity: string; message: string };
  const layoutIssues = (layout: readonly string[]): Found[] => {
    const found: Found[] = [];
    checkLayout(layout, (path, severity, message) =>
      found.push({ path: path.join('.'), severity, message }),
    );
    return found;
  };

  it('passes every campaign level and the endless room', () => {
    for (const level of LEVELS) {
      expect({ id: level.id, issues: layoutIssues(level.layout) }).toEqual({
        id: level.id,
        issues: [],
      });
    }
    expect(layoutIssues(ENDLESS_LAYOUT)).toEqual([]);
  });

  it('warns once for same-row stations 2 columns apart and accepts 3', () => {
    const base = realContent().level.layout;
    const close = base.map((row, y) => (y === 1 ? '#CCCC...I.A.....R..#' : row));
    expect(layoutIssues(close)).toEqual([
      {
        path: 'layout.1',
        severity: 'warning',
        message:
          'station signs overlap on phones: imageSearch-0 and archive-0 are 2 columns apart; keep at least 3',
      },
    ]);
    const apart = base.map((row, y) => (y === 1 ? '#CCCC...I..A....R..#' : row));
    expect(layoutIssues(apart)).toEqual([]);
  });

  it('ignores stations in different rows and the same column', () => {
    const base = realContent().level.layout;
    const stacked = base.map((row, y) =>
      y === 1 ? '#CCCC...I.......R..#' : y === 2 ? '#.......A..........#' : row,
    );
    expect(layoutIssues(stacked)).toEqual([]);
  });

  it('reports one error for a walled-off fixture and one for a walled-off spawn', () => {
    const base = realContent().level.layout;
    const walled = base.map(
      (row, y) =>
        ({
          6: '#...............=..#',
          7: '#..3....=DD=...=4=.#',
          8: '#.=.....====....=..#',
          9: '#=T=.............T.#',
          10: '#.=................#',
        })[y] ?? row,
    );
    expect(layoutIssues(walled)).toEqual([
      {
        path: 'layout.7',
        severity: 'error',
        message: 'spawn 4 at column 16 cannot be reached from spawn 1',
      },
      {
        path: 'layout.9',
        severity: 'error',
        message: 'table-2 at column 2 cannot be reached from spawn 1',
      },
    ]);
  });

  it('skips a layout that does not parse (the schema reports it)', () => {
    expect(layoutIssues(['###', '#?#', '###'])).toEqual([]);
  });
});

describe('endless decks (checkEndlessDecks)', () => {
  const deckIssues = (levels: Parameters<typeof checkEndlessDecks>[0]) => {
    const issues: [string, string, string][] = [];
    checkEndlessDecks(levels, STORIES, (path, severity, message) =>
      issues.push([path.join('.'), severity, message]),
    );
    return issues;
  };

  it('accepts the real campaign: every endless deck holds at least ENDLESS_MIN_DECK stories', () => {
    expect(deckIssues(LEVELS)).toEqual([]);
  });

  it('warns about every thin non-hint deck when only level 1 feeds endless', () => {
    const l1 = LEVELS.find((level) => level.id === 'l1-burza');
    if (!l1) {
      throw new Error('level 1 missing');
    }
    const thin = (station: string): [string, string, string] => [
      `decks.${station}`,
      'warning',
      `endless deck of station ${station} holds 0 stories; aim for at least 4 (add stories decided at ${station} to a campaign level)`,
    ];
    expect(deckIssues([l1])).toEqual([thin('archive'), thin('phone'), thin('dataLibrary')]);
  });

  it('skips content without a campaign level (the greybox alone feeds no endless pool)', () => {
    expect(deckIssues(LEVELS.filter((level) => level.id === 'l0-greybox'))).toEqual([]);
    expect(deckIssues([])).toEqual([]);
  });

  it('files the deck warnings under the endless pseudo-file in validateContent', () => {
    const l1 = LEVEL_FILES['levels/l1-burza.json'];
    const issues = validateContent(
      [{ file: 'levels/l1-burza.json', data: l1 }],
      [{ file: 'stories/l1-burza.json', data: STORY_FILES['stories/l1-burza.json'] }],
    );
    expect(issues.filter((issue) => issue.file === ENDLESS_ISSUE_FILE).map((i) => i.path)).toEqual([
      'decks.archive',
      'decks.phone',
      'decks.dataLibrary',
    ]);
  });
});

describe('validate CLI', () => {
  const run = (...args: string[]) =>
    Bun.spawnSync([process.execPath, 'src/validate.ts', ...args], { cwd: packageRoot });

  it('passes on the real content', () => {
    const result = run();
    const out = result.stdout.toString();
    // Decisive stamps that do not justify (S7-21 warning): S7-33 cleaned up l4, S7-58 cleaned l6.
    const decisiveNotJustifying = [...out.matchAll(/decisive stamp "([^"]+)" does not justify/g)];
    expect(decisiveNotJustifying.map((match) => match[1])).toEqual([]);
    // New stories wait for their level's bag pool: since S7-31 and S7-33 every l3 and l4 story
    // is in its level's pool.
    const notScheduled = [...out.matchAll(/story "([^"]+)" is not scheduled in any level/g)];
    expect(notScheduled.map((match) => match[1]).filter((id) => id?.startsWith('l4-'))).toEqual([]);
    expect(notScheduled.map((match) => match[1]).filter((id) => id?.startsWith('l3-'))).toEqual([]);
    // l0's last Normal slot window (175 s + 90 s) runs past its 240 s; the generator clamps it.
    const deadlineFit = [...out.matchAll(/warning (levels\/\S+) bag\.lastSpawnS: /g)];
    expect(deadlineFit.map((match) => match[1])).toEqual(['levels/l0-greybox.json']);
    expect(out).toContain(
      'warning levels/l0-greybox.json bag.lastSpawnS: a folder at 175 s needs up to 90 s, past the level end at 240 s; late folders get less time',
    );
    const warnings = decisiveNotJustifying.length + notScheduled.length + deadlineFit.length;
    expect(out).toContain(`0 error(s), ${warnings} warning(s)`);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 when the content only has warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-warnings-'));
    try {
      const content = realContent();
      content.level.stars = { two: 230, three: 238 };
      mkdirSync(join(dir, 'levels'));
      mkdirSync(join(dir, 'stories'));
      writeFileSync(join(dir, 'levels/l0-greybox.json'), JSON.stringify(content.level));
      writeFileSync(join(dir, 'stories/l0-greybox.json'), JSON.stringify(content.stories));
      const result = run(dir);
      expect(result.stdout.toString()).toContain('0 error(s), 2 warning(s)');
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on the broken fixtures with readable messages', () => {
    const result = run('src/__fixtures__/broken');
    const out = result.stdout.toString();
    expect(result.exitCode).toBe(1);
    for (const line of [
      formatIssue({
        severity: 'error',
        file: 'stories/l0-broken.json',
        path: '[0].correctVerdict',
        message: 'truth "false" requires verdict "reject"',
      }),
      formatIssue({
        severity: 'error',
        file: 'stories/l0-broken.json',
        path: '[1].justifyingStamps[0]',
        message: 'unknown stamp "l0-nie-ma-takiej"',
      }),
      formatIssue({
        severity: 'error',
        file: 'levels/l0-broken.json',
        path: 'schedule[1].storyId',
        message: 'unknown story "l0-brakujaca-historia"',
      }),
      formatIssue({
        severity: 'error',
        file: 'levels/l0-broken.json',
        path: 'schedule[0].storyId',
        message:
          'story "l0-nierozwiazywalna" is unsolvable: no justifying stamp comes from imageSearch, archive, sourceRegistry',
      }),
      formatIssue({
        severity: 'error',
        file: 'levels/l0-unsorted.json',
        path: 'schedule[1]',
        message: 'schedule must be sorted',
      }),
    ]) {
      expect(out).toContain(line);
    }
  });
});

describe('validateTechniques', () => {
  const stories = [
    { file: 'stories/l0-x.json', data: [{ technique: 'a-alias' }, { technique: 'none' }] },
  ];
  const card = (id: string, aliases: string[] = []) => ({
    id,
    aliases,
    name: 'Nazwa',
    how: 'Jak to działa.',
    detect: 'Jak to wykryć.',
    stations: ['archive'],
    realWorld: 'Przykład.',
    hint: 'Podpowiedź.',
  });
  const file = (...cards: unknown[]) => [{ file: 'techniques/t.json', data: cards }];

  it('accepts the real techniques for the real stories', () => {
    const real = (dir: 'techniques' | 'stories') =>
      readdirSync(join(packageRoot, dir))
        .filter((name) => name.endsWith('.json'))
        .map((name) => ({
          file: `${dir}/${name}`,
          data: JSON.parse(readFileSync(join(packageRoot, dir, name), 'utf8')),
        }));
    expect(validateTechniques(real('techniques'), real('stories'))).toEqual([]);
  });

  it('maps aliases to their card without warnings', () => {
    expect(validateTechniques(file(card('a', ['a-alias']), card('none')), stories)).toEqual([]);
  });

  it('warns about a story technique without a card and about an unused card', () => {
    const issues = validateTechniques(file(card('none'), card('unused')), stories);
    expect(issues.map((i) => [i.severity, i.path, i.message])).toEqual([
      ['warning', '[0].technique', 'technique "a-alias" has no encyclopedia card'],
      ['warning', '[1].id', 'technique "unused" is used by no story'],
    ]);
  });

  it('errors on a duplicate id or alias', () => {
    const issues = validateTechniques(file(card('a', ['x']), card('b', ['x']), card('a')), stories);
    expect(issues.filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([
      '"x" already belongs to technique "a"',
      '"a" already belongs to technique "a"',
    ]);
  });

  it('errors on a card that breaks the schema', () => {
    const issues = validateTechniques(file({ ...card('a'), stations: [] }), stories);
    expect(issues.some((i) => i.severity === 'error' && i.path === '[0].stations')).toBe(true);
  });
});

describe('bag levels (checkBag)', () => {
  const validate = (content: BagContent) => {
    const { levels, stories } = toFiles(content);
    return validateContent(levels, stories);
  };
  const LEVEL = 'levels/l0-greybox.json';
  const bagOf = (content: BagContent) => {
    const { bag } = content.level;
    if (!bag) {
      throw new Error('fixture level has no bag');
    }
    return bag;
  };

  it('accepts the fixture bag level without errors or warnings', () => {
    expect(validate(bagContent())).toEqual([]);
  });

  it('reports a pool too thin to cover a run on every difficulty', () => {
    const issues = validate(thinBagContent());
    expect(
      issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message),
    ).toEqual([...THIN_POOL_ERRORS]);
    expect(issues).toContainEqual({
      severity: 'warning',
      file: LEVEL,
      path: 'bag.pool',
      message:
        'station imageSearch has 0 pinned stories (decided only there, one proof); aim for 4 (10 Normal folders over 3 stations)',
    });
  });

  it('warns about a decisive pool stamp that does not justify the verdict', () => {
    const content = bagContent();
    const story = content.stories.find((s) => s.id === 'l0-bag-lupa-prawda');
    const archive = story?.stamps.find((stamp) => stamp.station === 'archive');
    if (!archive) {
      throw new Error('fixture stamp missing');
    }
    archive.relevance = 'decisive';
    expect(validate(content)).toEqual([
      {
        severity: 'warning',
        file: 'stories/l0-greybox.json',
        path: '[10].stamps[1].relevance',
        message:
          'decisive stamp "l0-bag-lupa-prawda-archive" does not justify the verdict, so archive decides nothing; add it to justifyingStamps or lower its relevance',
      },
    ]);
  });

  it('reports unknown and event stories in the pool', () => {
    const content = bagContent();
    bagOf(content).pool.push('l0-nie-ma-takiej');
    content.level.events = [{ kind: 'viral', atS: 30, storyId: 'l0-zalany-rynek', deadlineS: 60 }];
    const issues = validate(content);
    expect(issues).toContainEqual({
      severity: 'error',
      file: LEVEL,
      path: 'bag.pool[17]',
      message: 'unknown story "l0-nie-ma-takiej"',
    });
    expect(issues).toContainEqual({
      severity: 'error',
      file: LEVEL,
      path: 'bag.pool[0]',
      message: 'story "l0-zalany-rynek" is also an event story; keep event stories out of the pool',
    });
  });

  it('reports a pool story of another level and the stamps it is missing', () => {
    const content = bagContent();
    const foreign = content.stories.find((s) => s.id === 'l0-bag-lupa-satyra');
    if (!foreign) {
      throw new Error('fixture story missing');
    }
    content.stories = content.stories.filter((s) => s !== foreign);
    const moved = { ...foreign, id: 'l1-obca-historia' };
    bagOf(content).pool = bagOf(content).pool.map((id) => (id === foreign.id ? moved.id : id));
    const issues = validate({ ...content, stories: [...content.stories, moved] });
    expect(issues).toContainEqual({
      severity: 'error',
      file: LEVEL,
      path: 'bag.pool[12]',
      message: 'story "l1-obca-historia" belongs to level 1, not level 0',
    });
  });

  it('warns about late deadlines, star shares off the aim and an idle station', () => {
    const content = thinBagContent();
    const bag = bagOf(content);
    bag.deadlineS.important = 90;
    bag.starShares = { two: 0.3, three: 0.8 };
    bag.pool = bag.pool.filter((id) => id !== 'l0-zalany-rynek' && id !== 'l0-most-zamkniety');
    const issues = validate(content);
    expect(issues).toContainEqual({
      severity: 'warning',
      file: LEVEL,
      path: 'bag.lastSpawnS',
      message:
        'a folder at 175 s needs up to 90 s, past the level end at 240 s; late folders get less time',
    });
    expect(issues).toContainEqual({
      severity: 'warning',
      file: LEVEL,
      path: 'bag.starShares.two',
      message: 'two stars at 30% of the run maximum; aim for 35–65%',
    });
    expect(issues).toContainEqual({
      severity: 'warning',
      file: LEVEL,
      path: 'stations[0]',
      message: 'station "imageSearch" decides no pool story; it stays idle',
    });
  });

  it('rejects a level file with both a schedule and a bag, or neither', () => {
    const both = realContent();
    const withBag = { ...both.level, bag: bagOverSchedule(both) };
    const { schedule: _schedule, stars: _stars, ...neither } = both.level;
    const messages = (level: unknown) =>
      validateContent(
        [{ file: LEVEL, data: level }],
        [{ file: 'stories/l0-greybox.json', data: both.stories }],
      )
        .filter((issue) => issue.severity === 'error')
        .map((issue) => `${issue.path}: ${issue.message}`);
    expect(messages(withBag)).toEqual(['bag: a level has either a schedule or a bag, not both']);
    expect(messages(neither)).toEqual([': a level needs a schedule or a bag']);
  });

  it('rejects stars, a late last folder, duplicate ids and shares that do not grow', () => {
    const content = bagContent();
    const bag = bagOf(content);
    const level = {
      ...content.level,
      stars: { two: 100, three: 200 },
      bag: {
        ...bag,
        lastSpawnS: 240,
        pool: [...bag.pool, 'l0-zalany-rynek'],
        starShares: { two: 0.8, three: 0.8 },
      },
    };
    const issues = validateContent(
      [{ file: LEVEL, data: level }],
      [{ file: 'stories/l0-greybox.json', data: content.stories }],
    );
    expect(issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([
      'stars: a bag level gets its stars from each run (use bag.starShares)',
      'bag.lastSpawnS: the last folder comes after the level ends',
      'bag.starShares: three stars must need a larger share',
      'bag.pool[17]: duplicate id "l0-zalany-rynek"',
    ]);
  });
});

/** A valid bag block over the greybox schedule's stories. */
function bagOverSchedule(content: ReturnType<typeof realContent>) {
  return { ...FIXTURE_BAG, pool: content.level.schedule.map((spawn) => spawn.storyId) };
}

/** The ten greybox stories as a pool: the image search decides only two of them. */
const THIN_POOL_ERRORS: readonly string[] = [
  ['imageSearch', 3, 'easy'],
  ['imageSearch', 4, 'normal'],
  ['imageSearch', 4, 'hard'],
  ['archive', 4, 'hard'],
  ['imageSearch', 4, 'expert'],
  ['archive', 4, 'expert'],
].map(
  ([station, demand, difficulty]) =>
    `station ${station} cannot get ${demand} distinct folders on ${difficulty}; add stories decided only at ${station}`,
);
