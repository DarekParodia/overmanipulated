import { describe, expect, it } from 'bun:test';
import { briefingRun } from './briefing-model.ts';

describe('briefingRun', () => {
  it('reads the folders and thresholds of the dealt run, with the shares in whole percent', () => {
    expect(briefingRun({ folders: 14, maxScore: 137, stars: { two: 75, three: 110 } })).toEqual({
      folders: 14,
      maxScore: 137,
      two: 75,
      three: 110,
      shares: { two: 55, three: 80 },
    });
  });

  it('rounds a share to the nearest percent', () => {
    expect(
      briefingRun({ folders: 9, maxScore: 160, stars: { two: 90, three: 130 } })?.shares,
    ).toEqual({ two: 56, three: 81 });
  });

  it('has no run line before the deal or in endless', () => {
    expect(briefingRun(null)).toBeNull();
    expect(briefingRun({ folders: 30, maxScore: 900, stars: null })).toBeNull();
  });

  it('keeps the thresholds but drops the shares when the run cannot score', () => {
    expect(briefingRun({ folders: 0, maxScore: 0, stars: { two: 0, three: 0 } })).toEqual({
      folders: 0,
      maxScore: 0,
      two: 0,
      three: 0,
      shares: null,
    });
  });
});
