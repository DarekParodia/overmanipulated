import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { correctVerdictFor, EVENTS } from '@redakcja/shared';
import { BROKEN_CASES, realContent, toFiles } from './__fixtures__/broken.ts';
import {
  checkRegistration,
  formatIssue,
  maxLevelScore,
  maxStoryScore,
  validateContent,
} from './checks.ts';
import { LEVEL_FILES, STORY_FILES } from './files.ts';
import { LEVELS, STORIES } from './index.ts';

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
    if (!l1) {
      throw new Error('level 1 missing');
    }
    const { topic: _topic, briefingPoints: _points, ...rest } = l1;
    const issues = validateContent(
      [{ file: 'levels/l1-burza.json', data: rest }],
      [{ file: 'stories/l1-burza.json', data: l1Stories }],
    );
    expect(issues.map((i) => [i.severity, i.path])).toEqual([
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

describe('greybox content', () => {
  const level = LEVELS.find((l) => l.id === 'l0-greybox');
  const scheduled = STORIES.filter((s) => level?.schedule.some((spawn) => spawn.storyId === s.id));

  it('schedules at least 8 stories that cover every truth value and priority', () => {
    expect(scheduled.length).toBeGreaterThanOrEqual(8);
    expect(new Set(scheduled.map((s) => s.truth))).toEqual(
      new Set(['true', 'false', 'misleading', 'satire', 'unverifiable']),
    );
    expect(new Set(scheduled.map((s) => s.priority))).toEqual(
      new Set(['normal', 'important', 'urgent']),
    );
    const unverifiable = scheduled.filter((s) => s.truth === 'unverifiable');
    expect(unverifiable.some((s) => s.priority === 'urgent')).toBe(true);
    expect(unverifiable.some((s) => s.priority !== 'urgent')).toBe(true);
    expect(new Set(scheduled.map((s) => s.type)).size).toBeGreaterThanOrEqual(5);
  });

  it('gives every story one stamp per level station and a matching verdict', () => {
    for (const story of scheduled) {
      const stations: string[] = story.stamps.map((s) => s.station).sort();
      expect(stations).toEqual(['archive', 'imageSearch', 'sourceRegistry']);
      expect(story.correctVerdict).toBe(correctVerdictFor(story.truth, story.priority));
      expect(story.reviewed).toBe(false);
    }
  });

  it('sets star thresholds near 50% and 80% of the maximum score', () => {
    if (!level) {
      throw new Error('greybox level missing');
    }
    const max = maxLevelScore(level, new Map(STORIES.map((s) => [s.id, s])));
    expect(max).toBe(240);
    expect(level.stars.two / max).toBeCloseTo(0.5, 1);
    expect(level.stars.three / max).toBeCloseTo(0.8, 1);
  });
});

describe('level 1 content', () => {
  const level = LEVELS.find((l) => l.id === 'l1-burza');
  const scheduled = STORIES.filter((s) => level?.schedule.some((spawn) => spawn.storyId === s.id));

  it('schedules 15 stories for the image search and source registry only', () => {
    expect(level?.stations).toEqual(['imageSearch', 'sourceRegistry']);
    expect(scheduled).toHaveLength(15);
    expect(new Set(scheduled.map((s) => s.priority))).toEqual(
      new Set(['normal', 'important', 'urgent']),
    );
    const techniques = new Set(scheduled.map((s) => s.technique));
    expect(techniques).toContain('stare-zdjecie-nowy-podpis');
    expect(techniques).toContain('podszywanie-sie-pod-instytucje');
    expect(scheduled.some((s) => s.truth === 'unverifiable' && s.priority === 'urgent')).toBe(true);
  });

  it('gives every story one stamp per level station and a matching verdict', () => {
    for (const story of scheduled) {
      const stations: string[] = story.stamps.map((s) => s.station).sort();
      expect(stations).toEqual(['imageSearch', 'sourceRegistry']);
      expect(story.correctVerdict).toBe(correctVerdictFor(story.truth, story.priority));
      expect(story.reviewed).toBe(false);
    }
  });

  it('ends every deadline before the level ends and sets stars near 50% and 80%', () => {
    if (!level) {
      throw new Error('level 1 missing');
    }
    for (const spawn of level.schedule) {
      expect(spawn.atS + spawn.deadlineS).toBeLessThanOrEqual(level.durationS);
    }
    const max = maxLevelScore(level, new Map(STORIES.map((s) => [s.id, s])));
    expect(level.stars.two / max).toBeCloseTo(0.5, 1);
    expect(level.stars.three / max).toBeCloseTo(0.8, 1);
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

describe('validate CLI', () => {
  const run = (...args: string[]) =>
    Bun.spawnSync([process.execPath, 'src/validate.ts', ...args], { cwd: packageRoot });

  it('passes on the real content', () => {
    const result = run();
    expect(result.stdout.toString()).toContain('0 error(s), 0 warning(s)');
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
