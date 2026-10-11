import { describe, expect, it } from 'bun:test';
import { LEVELS } from '@redakcja/content';
import { fixtureAt, GREYBOX_MAP } from '@redakcja/shared';
import { mapForLevel } from '../net/runtime.ts';
import { DECOR_LIMIT, decorSlots, freeWallColumns } from './decor-layout.ts';
import { THEMES, themeForLevel } from './theme.ts';

describe('themeForLevel', () => {
  it('gives every campaign level and endless its own theme', () => {
    const themes = new Set(LEVELS.map((level) => themeForLevel(level.id).id));
    expect(themes.size).toBe(LEVELS.length);
    expect(themeForLevel('endless')).toBe(THEMES.endless);
  });

  it('falls back to the training look for unknown ids', () => {
    expect(themeForLevel('nope')).toBe(THEMES.training);
  });
});

describe('decorSlots', () => {
  it('stays within the limit and inside the back wall, for every level', () => {
    for (const level of LEVELS) {
      const map = mapForLevel(level.id);
      const slots = decorSlots(map, themeForLevel(level.id));
      expect(slots.length).toBeLessThanOrEqual(DECOR_LIMIT);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.col).toBeGreaterThanOrEqual(1);
        expect(slot.col).toBeLessThan(map.width - 1);
      }
    }
  });

  it('never hangs art behind the conveyor or a station', () => {
    for (const level of LEVELS) {
      const map = mapForLevel(level.id);
      for (const slot of decorSlots(map, themeForLevel(level.id))) {
        const below = fixtureAt(map, slot.col, 1);
        expect(below?.kind === 'station' || below?.kind === 'conveyor').toBe(false);
      }
    }
  });

  it('keeps slots apart so neighbours never touch', () => {
    const slots = decorSlots(GREYBOX_MAP, THEMES.storm);
    for (let i = 1; i < slots.length; i++) {
      expect((slots[i]?.col ?? 0) - (slots[i - 1]?.col ?? 0)).toBeGreaterThanOrEqual(2);
    }
    expect(freeWallColumns(GREYBOX_MAP).length).toBeGreaterThan(0);
  });
});
