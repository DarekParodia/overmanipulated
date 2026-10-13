import { describe, expect, it } from 'bun:test';
import type { StationKind } from '@redakcja/shared';
import { decidingStations, isPinned } from './bag.ts';
import { getLevel, getStory } from './index.ts';

// S7-32: l4 Zdrowie part 1 adds pinned stories for the archive (4) and the phone (1).
const PINNED: readonly [string, StationKind][] = [
  ['l4-tlumy-na-sorze', 'archive'],
  ['l4-zimna-woda-po-obiedzie', 'archive'],
  ['l4-ratownik-o-kaskach', 'archive'],
  ['l4-basen-zamkniety', 'archive'],
  ['l4-sobotnie-szczepienia', 'phone'],
];

describe('l4 Zdrowie part 1 stories', () => {
  const stations = getLevel('l4-zdrowie')?.stations ?? [];

  it('plays on the four l4 stations', () => {
    expect(stations).toEqual(['sourceRegistry', 'archive', 'phone', 'dataLibrary']);
  });

  for (const [id, station] of PINNED) {
    it(`pins ${id} to ${station}`, () => {
      const story = getStory(id);
      expect(story).toBeDefined();
      if (!story) {
        return;
      }
      expect(story.reviewed).toBe(false);
      expect(story.requiredStamps).toBe(1);
      expect(story.stamps.map((stamp) => stamp.station)).toEqual(stations);
      expect(decidingStations(story, stations)).toEqual([station]);
      expect(isPinned(story, stations)).toBe(true);
      // Only the proof looks decisive, so no other station promises more than it gives.
      expect(
        story.stamps.filter((stamp) => stamp.relevance === 'decisive').map((s) => s.station),
      ).toEqual([station]);
    });
  }

  it('keeps about a third of the new stories true', () => {
    const truths = PINNED.map(([id]) => getStory(id)?.truth);
    expect(truths.filter((truth) => truth === 'true')).toHaveLength(2);
  });
});
