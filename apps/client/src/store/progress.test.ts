import { describe, expect, it } from 'bun:test';
import { campaignTiles, levelNumber, newStations, parseProgress, withResult } from './progress.ts';

const training = { id: 'l0-greybox', stations: ['imageSearch', 'archive', 'sourceRegistry'] };
const first = { id: 'l1-first-day', stations: ['imageSearch', 'sourceRegistry'] };
const second = { id: 'l2-election', stations: ['imageSearch', 'sourceRegistry', 'phone'] };
const third = { id: 'l3-heat', stations: ['phone', 'aiScanner'] };
const levels = [third, first, training, second];

describe('progress storage', () => {
  it('reads nothing from missing or broken data', () => {
    expect(parseProgress(null)).toEqual({});
    expect(parseProgress('{oops')).toEqual({});
    expect(parseProgress('[1,2]')).toEqual({});
    expect(parseProgress('"text"')).toEqual({});
  });

  it('keeps whole star counts and drops invalid entries', () => {
    expect(parseProgress('{"l1-a":2,"l2-b":"3","l3-c":-1,"l4-d":1.5,"l5-e":9}')).toEqual({
      'l1-a': 2,
      'l5-e': 3,
    });
  });

  it('stores the best stars and never lowers them', () => {
    let progress = withResult({}, 'l1-a', 1);
    expect(progress).toEqual({ 'l1-a': 1 });
    progress = withResult(progress, 'l1-a', 3);
    expect(progress).toEqual({ 'l1-a': 3 });
    const same = withResult(progress, 'l1-a', 2);
    expect(same).toBe(progress);
  });

  it('records a zero-star run so the level counts as played', () => {
    expect(withResult({}, 'l1-a', 0)).toEqual({ 'l1-a': 0 });
  });
});

describe('campaign map', () => {
  it('orders training first, then levels by number', () => {
    expect(levelNumber('l12-x')).toBe(12);
    const ids = campaignTiles(levels, {}).map((tile) => tile.level.id);
    expect(ids).toEqual(['l0-greybox', 'l1-first-day', 'l2-election', 'l3-heat']);
  });

  it('opens training and the first level from the start, locks the rest', () => {
    const tiles = campaignTiles(levels, {});
    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, false, false]);
    expect(tiles[0]?.training).toBe(true);
  });

  it('opens the next level once the previous one has a star', () => {
    expect(campaignTiles(levels, { 'l1-first-day': 0 }).map((tile) => tile.unlocked)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    const tiles = campaignTiles(levels, { 'l1-first-day': 1 });
    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, true, false]);
    expect(tiles[1]?.stars).toBe(1);
  });

  it('does not unlock anything through the training level', () => {
    const tiles = campaignTiles(levels, { 'l0-greybox': 3 });
    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, false, false]);
  });
});

describe('new stations', () => {
  it('lists every station of the training and the first level', () => {
    expect(newStations(training, levels)).toEqual(['imageSearch', 'archive', 'sourceRegistry']);
    expect(newStations(first, levels)).toEqual(['imageSearch', 'sourceRegistry']);
  });

  it('lists only stations the previous campaign level did not have', () => {
    expect(newStations(second, levels)).toEqual(['phone']);
    expect(newStations(third, levels)).toEqual(['aiScanner']);
  });
});
