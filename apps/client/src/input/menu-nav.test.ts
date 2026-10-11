import { describe, expect, it } from 'bun:test';
import { type Direction, pickNext, type Rect } from './menu-nav.ts';

const box = (left: number, top: number, width = 100, height = 48): Rect => ({
  left,
  top,
  width,
  height,
});

// Two rows: a title row with two buttons, a wide primary button, a footer with two buttons.
const layout: Rect[] = [
  box(0, 0), // 0 top-left
  box(200, 0), // 1 top-right
  box(50, 100, 200), // 2 middle
  box(0, 200), // 3 bottom-left
  box(200, 200), // 4 bottom-right
];

describe('pickNext', () => {
  it('starts at the first control in reading order', () => {
    expect(pickNext(layout, null, 'down')).toBe(0);
    expect(pickNext([box(300, 0), box(10, 2)], null, 'right')).toBe(1);
    expect(pickNext([], null, 'down')).toBeNull();
  });

  it('moves to the nearest control in the pressed direction', () => {
    expect(pickNext(layout, 0, 'right')).toBe(1);
    expect(pickNext(layout, 0, 'down')).toBe(2);
    expect(pickNext(layout, 2, 'down')).toBe(3);
    expect(pickNext(layout, 4, 'up')).toBe(2);
    expect(pickNext(layout, 4, 'left')).toBe(3);
  });

  it('stays put at an edge instead of wrapping', () => {
    expect(pickNext(layout, 0, 'up')).toBe(0);
    expect(pickNext(layout, 0, 'left')).toBe(0);
    expect(pickNext(layout, 4, 'down')).toBe(4);
  });

  it('reaches every control from the first one (no focus traps)', () => {
    const dirs: Direction[] = ['up', 'down', 'left', 'right'];
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const at = queue.pop() as number;
      for (const dir of dirs) {
        const next = pickNext(layout, at, dir);
        if (next !== null && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(layout.length);
  });

  it('prefers a control straight ahead over a nearer one far to the side', () => {
    const rects = [box(0, 0), box(260, 60), box(0, 120)];
    expect(pickNext(rects, 0, 'down')).toBe(2);
  });

  it('moves along a vertical list one item at a time', () => {
    const list = [box(0, 0), box(0, 60), box(0, 120), box(0, 180)];
    let at = 0;
    for (let i = 1; i < list.length; i++) {
      at = pickNext(list, at, 'down') as number;
      expect(at).toBe(i);
    }
    expect(pickNext(list, at, 'up')).toBe(2);
  });
});
