import { describe, expect, it } from 'bun:test';
import { pickColor, takenColors } from './look.ts';

describe('pickColor (S7-105)', () => {
  it('honours a free preferred colour', () => {
    expect(pickColor(new Set([0, 1]), 3)).toBe(3);
  });

  it('falls back to the lowest free colour when the preferred one is taken', () => {
    expect(pickColor(new Set([0, 2]), 2)).toBe(1);
  });

  it('takes the lowest free colour without a preference', () => {
    expect(pickColor(new Set([0]), null)).toBe(1);
    expect(pickColor(new Set(), null)).toBe(0);
  });

  it('ignores a preference outside the palette', () => {
    expect(pickColor(new Set([0]), 7)).toBe(1);
  });

  it('gives 0 when every colour is taken', () => {
    expect(pickColor(new Set([0, 1, 2, 3]), 2)).toBe(0);
  });
});

describe('takenColors (S7-105)', () => {
  const players = [
    { id: 'p1', team: 0, colorIndex: 0 },
    { id: 'p2', team: 1, colorIndex: 1 },
    { id: 'p3', team: 0, colorIndex: 2 },
  ];

  it('lists the colours the other players of the team hold', () => {
    expect([...takenColors(players, 0, 'p1')]).toEqual([2]);
    expect([...takenColors(players, 1, 'p1')]).toEqual([1]);
    expect([...takenColors(players, 0, null)].sort()).toEqual([0, 2]);
  });
});
