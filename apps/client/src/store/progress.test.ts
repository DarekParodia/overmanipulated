import { describe, expect, it } from 'bun:test';
import {
  bestStars,
  campaignTiles,
  levelNumber,
  newStations,
  parseProgress,
  starsOn,
  starTotals,
  withResult,
} from './progress.ts';

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

  it('keeps whole star counts per difficulty and drops invalid entries', () => {
    expect(
      parseProgress(
        '{"normal":{"l1-a":2,"l2-b":"3","l3-c":-1,"l4-d":1.5,"l5-e":9},"hard":{"l1-a":1},"insane":{"l1-a":3},"easy":7}',
      ),
    ).toEqual({ normal: { 'l1-a': 2, 'l5-e': 3 }, hard: { 'l1-a': 1 } });
  });

  it('migrates v1 progress into normal', () => {
    expect(parseProgress(null, '{"l1-a":2,"l2-b":"x","l3-c":5}')).toEqual({
      normal: { 'l1-a': 2, 'l3-c': 3 },
    });
    expect(parseProgress('{oops', '{"l1-a":1}')).toEqual({ normal: { 'l1-a': 1 } });
    expect(parseProgress(null, '{oops')).toEqual({});
    expect(parseProgress(null, '{}')).toEqual({});
  });

  it('ignores v1 once v2 progress exists', () => {
    expect(parseProgress('{"hard":{"l2-b":1}}', '{"l1-a":3}')).toEqual({ hard: { 'l2-b': 1 } });
    expect(parseProgress('{}', '{"l1-a":3}')).toEqual({});
  });

  it('stores the best stars per difficulty and never lowers them', () => {
    let progress = withResult({}, 'normal', 'l1-a', 1);
    expect(progress).toEqual({ normal: { 'l1-a': 1 } });
    progress = withResult(progress, 'normal', 'l1-a', 3);
    expect(progress).toEqual({ normal: { 'l1-a': 3 } });
    const same = withResult(progress, 'normal', 'l1-a', 2);
    expect(same).toBe(progress);
    progress = withResult(progress, 'hard', 'l1-a', 1);
    expect(progress).toEqual({ normal: { 'l1-a': 3 }, hard: { 'l1-a': 1 } });
  });

  it('records a zero-star run so the level counts as played', () => {
    expect(withResult({}, 'expert', 'l1-a', 0)).toEqual({ expert: { 'l1-a': 0 } });
  });

  it('reads the stars of one difficulty and the best across all', () => {
    const progress = { easy: { 'l1-a': 3, 'l2-b': 0 }, hard: { 'l2-b': 2, 'l3-c': 1 } };
    expect(starsOn(progress, 'hard')).toEqual({ 'l2-b': 2, 'l3-c': 1 });
    expect(starsOn(progress, 'normal')).toEqual({});
    expect(bestStars(progress)).toEqual({ 'l1-a': 3, 'l2-b': 2, 'l3-c': 1 });
  });
});

describe('campaign map', () => {
  it('orders training first, then levels by number', () => {
    expect(levelNumber('l12-x')).toBe(12);
    const ids = campaignTiles(levels, {}, 'normal').map((tile) => tile.level.id);
    expect(ids).toEqual(['l0-greybox', 'l1-first-day', 'l2-election', 'l3-heat']);
  });

  it('opens training and the first level from the start, locks the rest', () => {
    const tiles = campaignTiles(levels, {}, 'normal');
    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, false, false]);
    expect(tiles[0]?.training).toBe(true);
  });

  it('opens the next level once the previous one has a star', () => {
    const zero = campaignTiles(levels, { normal: { 'l1-first-day': 0 } }, 'normal');
    expect(zero.map((tile) => tile.unlocked)).toEqual([true, true, false, false]);
    const tiles = campaignTiles(levels, { normal: { 'l1-first-day': 1 } }, 'normal');
    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, true, false]);
    expect(tiles[1]?.stars).toBe(1);
  });

  it('unlocks with the best stars across difficulties', () => {
    const progress = { easy: { 'l1-first-day': 2, 'l2-election': 1 }, hard: { 'l1-first-day': 0 } };
    const onHard = campaignTiles(levels, progress, 'hard');
    expect(onHard.map((tile) => tile.unlocked)).toEqual([true, true, true, true]);
    // The tiles show what was earned on the shown difficulty.
    expect(onHard.map((tile) => tile.stars)).toEqual([0, 0, 0, 0]);
    const onEasy = campaignTiles(levels, progress, 'easy');
    expect(onEasy.map((tile) => tile.stars)).toEqual([0, 2, 1, 0]);
  });

  it('opens a level earned before difficulties existed on every difficulty', () => {
    const migrated = parseProgress(null, '{"l1-first-day":1}');
    const tiles = campaignTiles(levels, migrated, 'expert');
    expect(tiles.map((tile) => tile.unlocked)).toEqual([true, true, true, false]);
  });

  it('does not unlock anything through the training level', () => {
    const tiles = campaignTiles(levels, { normal: { 'l0-greybox': 3 } }, 'normal');
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

describe('star totals (profile, S7-104)', () => {
  it('sums the stars per difficulty over the shipped levels, easiest first', () => {
    const progress = {
      easy: { 'l0-greybox': 3, 'l1-first-day': 2 },
      hard: { 'l1-first-day': 1, 'l9-removed': 3 },
    };
    expect(starTotals(progress, ['l0-greybox', 'l1-first-day'])).toEqual([
      { difficulty: 'easy', stars: 5, max: 6 },
      { difficulty: 'normal', stars: 0, max: 6 },
      { difficulty: 'hard', stars: 1, max: 6 },
      { difficulty: 'expert', stars: 0, max: 6 },
    ]);
  });
});
