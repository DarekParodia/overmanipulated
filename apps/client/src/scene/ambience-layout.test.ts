import { describe, expect, test } from 'bun:test';
import { getLevel } from '@redakcja/content';
import { fixtureAt, parseLayout, tileAt } from '@redakcja/shared';
import { AMBIENCE_LIMITS, ambienceLayout } from './ambience-layout.ts';

const level = getLevel('l0-greybox');
if (!level) {
  throw new Error('l0-greybox missing');
}
const map = parseLayout(level.layout);

describe('ambience layout', () => {
  const layout = ambienceLayout(map);

  test('props stand only on decorative furniture, never on fixtures', () => {
    for (const t of [...layout.monitors, ...layout.stacks, ...layout.fans]) {
      expect(tileAt(map, t.col, t.row)).toBe('furniture');
      expect(fixtureAt(map, t.col, t.row)).toBeUndefined();
    }
    expect(layout.monitors.length).toBeGreaterThan(0);
    expect(layout.stacks.length).toBeGreaterThan(0);
    expect(layout.monitors.length).toBeLessThanOrEqual(AMBIENCE_LIMITS.monitors);
    expect(layout.stacks.length).toBeLessThanOrEqual(AMBIENCE_LIMITS.stacks);
  });

  test('one or two fans, never sharing a tile with another prop', () => {
    expect(layout.fans.length).toBeGreaterThanOrEqual(1);
    expect(layout.fans.length).toBeLessThanOrEqual(2);
    const taken = new Set([...layout.monitors, ...layout.stacks].map((t) => `${t.col},${t.row}`));
    for (const fan of layout.fans) {
      expect(taken.has(`${fan.col},${fan.row}`)).toBe(false);
    }
  });

  test('the clock hangs on the back wall, away from the back-row stations', () => {
    const clock = layout.clock;
    expect(clock).not.toBeNull();
    if (!clock) {
      return;
    }
    expect(tileAt(map, clock.col, 0)).toBe('wall');
    const backRow = map.fixtures.filter((f) => f.row === 1).map((f) => f.col);
    for (const col of backRow) {
      expect(Math.abs(col - clock.col)).toBeGreaterThanOrEqual(2);
    }
  });

  test('a map without decorative furniture gets no desk props', () => {
    const bare = parseLayout(['#####', '#...#', '#.1.#', '#####']);
    const empty = ambienceLayout(bare);
    expect(empty.monitors).toHaveLength(0);
    expect(empty.stacks).toHaveLength(0);
    expect(empty.fans).toHaveLength(0);
  });
});
