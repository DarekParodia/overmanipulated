import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import { minigames } from '../stations/minigames/index.ts';
import { pickPracticeStory, practiceSeed, practiceStory } from './practice-model.ts';

type Fixture = { id: string; stamps: { station: StationKind }[] };

const FIXTURES: Fixture[] = [
  { id: 'a', stamps: [{ station: 'archive' }] },
  { id: 'b', stamps: [{ station: 'phone' }] },
  { id: 'c', stamps: [{ station: 'phone' }, { station: 'archive' }] },
  { id: 'd', stamps: [] },
  { id: 'e', stamps: [{ station: 'archive' }] },
];

describe('practice story', () => {
  it('rotates through the stories with a stamp for the station', () => {
    const ids = [0, 1, 2, 3, 4].map((n) => pickPracticeStory('archive', n, FIXTURES)?.id);
    expect(ids).toEqual(['a', 'c', 'e', 'a', 'c']);
    expect(pickPracticeStory('phone', 0, FIXTURES)?.id).toBe('b');
    expect(pickPracticeStory('phone', 1, FIXTURES)?.id).toBe('c');
    expect(pickPracticeStory('phone', 2, FIXTURES)?.id).toBe('b');
  });

  it('has nothing for a station no story needs', () => {
    expect(pickPracticeStory('metadata', 0, FIXTURES)).toBeUndefined();
    expect(pickPracticeStory('archive', 0, [])).toBeUndefined();
  });

  it('wraps a negative attempt instead of failing', () => {
    expect(pickPracticeStory('archive', -1, FIXTURES)?.id).toBe('e');
  });

  it('every station has a practice story from the game content, with its stamp', () => {
    for (const kind of STATION_KINDS) {
      const story = practiceStory(kind, 0);
      expect(story, kind).toBeDefined();
      expect(
        story?.stamps.some((stamp) => stamp.station === kind),
        kind,
      ).toBe(true);
    }
  });

  it('a new attempt deals a new story', () => {
    for (const kind of STATION_KINDS) {
      expect(practiceStory(kind, 1)?.id, kind).not.toBe(practiceStory(kind, 0)?.id);
    }
  });

  it('seeds are attempt + 1', () => {
    expect([0, 1, 2, 9].map(practiceSeed)).toEqual([1, 2, 3, 10]);
  });
});

// Practice must never reach the server: no module the practice round loads, directly or through
// other modules, may be net/session.ts (the only place that sends commands). Walks the relative
// static imports from PracticeRound.tsx; the minigame registry is in the graph, so all ten
// minigames are checked.
const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = resolve(HERE, '../net/session.ts');
const IMPORT = /^\s*(?:import|export)\s[^'";]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** Every client source file `entry` loads through relative imports, with the path that led there. */
function importGraph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() ?? '';
    if (!/\.tsx?$/.test(file)) {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    for (const pattern of [IMPORT, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
      for (const match of source.matchAll(pattern)) {
        const target = resolve(dirname(file), match[1] ?? '');
        // Every relative import names an existing file, so none slips past the walk unread.
        if (!existsSync(target)) {
          throw new Error(`${file} imports ${match[1]}, which is not a file`);
        }
        if (!seen.has(target)) {
          seen.set(target, [...(seen.get(file) ?? []), target]);
          queue.push(target);
        }
      }
    }
  }
  return seen;
}

describe('practice round imports', () => {
  const graph = importGraph(resolve(HERE, 'PracticeRound.tsx'));

  it('never loads net/session.ts, so it cannot send a command', () => {
    const path = graph.get(SESSION)?.map((file) => file.slice(resolve(HERE, '..').length + 1));
    expect(path).toBeUndefined();
  });

  it('walks a real graph: the frame, the clock and every minigame component', () => {
    expect(graph.has(resolve(HERE, '../stations/OverlayFrame.tsx'))).toBe(true);
    expect(graph.has(resolve(HERE, '../stations/use-minigame-clock.ts'))).toBe(true);
    const components = [...graph.keys()].filter((file) =>
      /\/stations\/minigames\/[A-Z][A-Za-z]+\.tsx$/.test(file),
    );
    expect(components.length).toBeGreaterThanOrEqual(10);
  });

  it('loads the minigame registry, so it plays all ten minigames', () => {
    expect(graph.has(resolve(HERE, '../stations/minigames/index.ts'))).toBe(true);
    expect(Object.keys(minigames).sort()).toEqual([...STATION_KINDS].sort());
    expect(STATION_KINDS).toHaveLength(10);
  });

  it('the walk itself finds net/session.ts where it is used (the station overlay)', () => {
    expect(importGraph(resolve(HERE, '../stations/StationOverlay.tsx')).has(SESSION)).toBe(true);
  });
});
