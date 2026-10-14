import { describe, expect, it } from 'bun:test';
import { getLevel } from '@redakcja/content';
import { ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { type DetailsLevel, levelDetails, sharePercent } from './level-details.ts';

function level(id: string): DetailsLevel {
  const found = getLevel(id);
  if (!found) {
    throw new Error(`no level ${id}`);
  }
  return found;
}

const AUTHORED: DetailsLevel = {
  id: 'l9-test',
  durationS: 300,
  stations: ['archive', 'phone'],
  events: [
    { kind: 'outage', atS: 30, station: 'phone', durationS: 20 },
    { kind: 'viral', atS: 60, storyId: 'a', deadlineS: 40 },
    { kind: 'outage', atS: 90, station: 'archive', durationS: 20 },
  ],
  schedule: [
    { atS: 0, storyId: 'a', deadlineS: 60 },
    { atS: 20, storyId: 'b', deadlineS: 60 },
    { atS: 40, storyId: 'c', deadlineS: 60 },
  ],
  stars: { two: 40, three: 70 },
};

describe('sharePercent', () => {
  it('rounds a share to whole percent', () => {
    expect(sharePercent(0.55)).toBe(55);
    expect(sharePercent(0.8)).toBe(80);
    expect(sharePercent(0.854)).toBe(85);
  });
});

describe('levelDetails', () => {
  it('describes a bag level in the lobby: shares, pool, no points before the run is dealt', () => {
    const details = levelDetails(level('l0-greybox'), 'coop', 'normal', null);
    expect(details).toEqual({
      endless: false,
      minutes: 4,
      folders: 8,
      poolSize: 17,
      stations: ['imageSearch', 'archive', 'sourceRegistry'],
      events: [],
      stars: { sharePercent: { two: 50, three: 80 }, points: null },
      rule: null,
    });
  });

  it('uses the default shares when the level sets none', () => {
    const details = levelDetails(level('l2-wybory'), 'coop', 'normal', null);
    expect(details.stars).toEqual({ sharePercent: { two: 55, three: 80 }, points: null });
    expect(details.minutes).toBe(7);
    expect(details.poolSize).toBe(18);
  });

  it('adds the dealt run: its folders and its thresholds in points', () => {
    const details = levelDetails(level('l1-burza'), 'coop', 'hard', {
      folders: 19,
      stars: { two: 210, three: 330 },
    });
    expect(details.folders).toBe(19);
    expect(details.stars).toEqual({
      sharePercent: { two: 55, three: 85 },
      points: { two: 210, three: 330 },
    });
  });

  it('lists each event kind once, in the order it first comes', () => {
    expect(levelDetails(level('l6-atak'), 'coop', 'normal', null).events).toEqual([
      'botRaid',
      'correction',
      'bossCall',
      'outage',
    ]);
    expect(levelDetails(level('l3-afera'), 'coop', 'normal', null).events).toEqual(['viral']);
  });

  it('shows an authored level with its fixed points and no pool', () => {
    expect(levelDetails(AUTHORED, 'coop', 'expert', null)).toEqual({
      endless: false,
      minutes: 5,
      folders: 3,
      poolSize: null,
      stations: ['archive', 'phone'],
      events: ['outage', 'viral'],
      stars: { sharePercent: null, points: { two: 40, three: 70 } },
      rule: null,
    });
  });

  it('adds the versus rule and keeps the stars', () => {
    const details = levelDetails(AUTHORED, 'versus', 'normal', null);
    expect(details.rule).toBe('versus');
    expect(details.stars?.points).toEqual({ two: 40, three: 70 });
  });

  it('gives endless no stars and no folder count; versus endless lasts 10 minutes', () => {
    const endless = level(ENDLESS_LEVEL_ID);
    const coop = levelDetails(endless, 'coop', 'normal', null);
    expect(coop.endless).toBe(true);
    expect(coop.minutes).toBeNull();
    expect(coop.folders).toBeNull();
    expect(coop.poolSize).toBeNull();
    expect(coop.stars).toBeNull();
    expect(coop.rule).toBe('endless');
    expect(coop.stations).toHaveLength(10);
    const versus = levelDetails(endless, 'versus', 'normal', null);
    expect(versus.minutes).toBe(10);
    expect(versus.rule).toBe('versusEndless');
  });
});
