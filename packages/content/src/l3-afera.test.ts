import { describe, expect, it } from 'bun:test';
import type { StationKind } from '@redakcja/shared';
import { decidingStations, isPinned } from './bag.ts';
import { getLevel, getStory } from './index.ts';

// S7-30: l3 Afera part 1 adds pinned stories for the image search (4) and the source registry (2).
const PINNED: readonly [string, StationKind][] = [
  ['l3-zalana-sala', 'imageSearch'],
  ['l3-dyrektor-na-plazy', 'imageSearch'],
  ['l3-pusta-stolowka', 'imageSearch'],
  ['l3-pracownia-robotyki', 'imageSearch'],
  ['l3-psycholog-z-sieci', 'sourceRegistry'],
  ['l3-zajecia-przed-matura', 'sourceRegistry'],
];

describe('l3 Afera part 1 stories', () => {
  const stations = getLevel('l3-afera')?.stations ?? [];

  it('plays on the four l3 stations', () => {
    expect(stations).toEqual(['imageSearch', 'sourceRegistry', 'archive', 'phone']);
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
