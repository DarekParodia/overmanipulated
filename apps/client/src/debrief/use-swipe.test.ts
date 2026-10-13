import { describe, expect, test } from 'bun:test';
import { swipeDirection } from './use-swipe.ts';

describe('swipeDirection', () => {
  test('a long horizontal drag turns the page', () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(80, -10)).toBe(-1);
  });

  test('short or mostly vertical drags do not', () => {
    expect(swipeDirection(-40, 0)).toBeNull();
    expect(swipeDirection(-80, 60)).toBeNull();
    expect(swipeDirection(0, 200)).toBeNull();
  });
});
