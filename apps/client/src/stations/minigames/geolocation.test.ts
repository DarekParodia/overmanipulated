import { describe, expect, it } from 'bun:test';
import { createRng, GEOLOCATION_MAP, GEOLOCATION_MAX_MISTAKES } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import {
  type Action,
  answerIndex,
  type GameState,
  type GeoPuzzle,
  generatePuzzle,
  geolocationOutcome,
  initialState,
  LANDMARK_PAIRS,
  LANDMARKS,
  type MapTile,
  NOT_HERE,
  reduce,
  sharedLandmarks,
  TILE_COUNT,
  tileShows,
} from './geolocation.logic.ts';

const t = pl.minigames.geolocation;
const DISTRICTS: readonly string[] = t.districts;

const story = (truth: 'true' | 'false' | 'misleading') => ({ headline: 'Most zamknięty', truth });
const stamp = (relevance: 'decisive' | 'misleading' | 'irrelevant') => ({
  relevance,
  text: 'Test',
});

/** The first 12 fixed pairs as tiles, named by the district list in order. */
const TILES: readonly MapTile[] = LANDMARK_PAIRS.slice(0, 12).map((landmarks, i) => ({
  district: DISTRICTS[i] ?? '',
  landmarks,
}));
const puzzle = (patch: Partial<GeoPuzzle>): GeoPuzzle => ({
  tiles: TILES,
  claimed: 0,
  photo: ['clockTower', 'archBridge'],
  answer: 0,
  outcome: 'match',
  scenery: [],
  ...patch,
});
/** Photo from tile 5 (Młyny: clockTower + portCrane), caption says tile 0 (Rynek). */
const otherDistrict = puzzle({
  outcome: 'otherDistrict',
  photo: ['portCrane', 'clockTower'],
  answer: 5,
});
/** windmill + monument is no tile's pair (tiles cover clockTower's pairs and archBridge's first). */
const otherTown = puzzle({ outcome: 'otherTown', photo: ['windmill', 'monument'], answer: null });

function run(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, action) => reduce(s, action)[0], state);
}

const pairKey = (tile: MapTile) => [...tile.landmarks].sort().join('+');

describe('landmarks and pairs', () => {
  it('has ten landmarks and all 45 unordered pairs', () => {
    expect(LANDMARKS).toHaveLength(10);
    expect(LANDMARK_PAIRS).toHaveLength(45);
    const keys = new Set(LANDMARK_PAIRS.map((pair) => [...pair].sort().join('+')));
    expect(keys.size).toBe(45);
    expect(LANDMARK_PAIRS.every(([a, b]) => a !== b)).toBe(true);
  });

  it('has a 4×3 map and twelve short district names', () => {
    expect(GEOLOCATION_MAP).toEqual({ columns: 4, rows: 3 });
    expect(TILE_COUNT).toBe(12);
    expect(NOT_HERE).toBe(12);
    expect(DISTRICTS).toHaveLength(12);
    expect(new Set(DISTRICTS).size).toBe(12);
    expect(DISTRICTS.every((name) => name.length <= 9)).toBe(true);
  });

  it('shows a tile only when both of its landmarks stand in the photo', () => {
    const tile: MapTile = { district: 'Rynek', landmarks: ['fountain', 'windmill'] };
    expect(tileShows(tile, ['windmill', 'fountain'])).toBe(true);
    expect(tileShows(tile, ['fountain', 'lighthouse'])).toBe(false);
    expect(tileShows(tile, ['lighthouse', 'monument'])).toBe(false);
    expect(sharedLandmarks(tile.landmarks, ['fountain', 'lighthouse'])).toBe(1);
  });
});

describe('geolocationOutcome', () => {
  // A stamp decides whether the photo is from elsewhere without a draw; only „where” rolls.
  const roll = (...values: number[]) => {
    const queue = [...values];
    return {
      next: () => {
        const value = queue.shift();
        if (value === undefined) throw new Error('rng used');
        return value;
      },
      int: () => {
        throw new Error('rng int used');
      },
    };
  };

  it('maps the stamp to the outcome', () => {
    expect(geolocationOutcome({ truth: 'true' }, stamp('decisive'), roll())).toBe('match');
    expect(geolocationOutcome({ truth: 'false' }, stamp('irrelevant'), roll())).toBe('match');
    expect(geolocationOutcome({ truth: 'false' }, stamp('misleading'), roll())).toBe('match');
    expect(geolocationOutcome({ truth: 'false' }, stamp('decisive'), roll(0.49))).toBe(
      'otherDistrict',
    );
    expect(geolocationOutcome({ truth: 'false' }, stamp('decisive'), roll(0.5))).toBe('otherTown');
    expect(geolocationOutcome({ truth: 'true' }, stamp('misleading'), roll(0))).toBe(
      'otherDistrict',
    );
  });

  it('rolls the problem chance without a stamp', () => {
    expect(geolocationOutcome({ truth: 'true' }, undefined, roll(0.5))).toBe('match');
    expect(geolocationOutcome({ truth: 'true' }, undefined, roll(0.49, 0.2))).toBe('otherDistrict');
    expect(geolocationOutcome({ truth: 'true' }, undefined, roll(0, 0.99))).toBe('otherTown');
  });

  it('gives every outcome over many unstamped rolls', () => {
    const rng = createRng(5);
    const seen = new Set(
      Array.from({ length: 200 }, () => geolocationOutcome({ truth: 'true' }, undefined, rng)),
    );
    expect([...seen].sort()).toEqual(['match', 'otherDistrict', 'otherTown']);
  });
});

describe('generatePuzzle', () => {
  it('is deterministic for a seed, story and stamp', () => {
    expect(generatePuzzle(11, story('false'), stamp('decisive'))).toEqual(
      generatePuzzle(11, story('false'), stamp('decisive')),
    );
    expect(generatePuzzle(11, story('false'), undefined)).toEqual(
      generatePuzzle(11, story('false'), undefined),
    );
  });

  it('builds twelve districts with unique names and unique landmark pairs', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('false'), undefined);
      expect(p.tiles).toHaveLength(12);
      expect(new Set(p.tiles.map(pairKey)).size).toBe(12);
      expect(new Set(p.tiles.map((tile) => tile.district)).size).toBe(12);
      for (const tile of p.tiles) {
        expect(DISTRICTS).toContain(tile.district);
        expect(tile.landmarks[0]).not.toBe(tile.landmarks[1]);
      }
      expect(p.claimed).toBeGreaterThanOrEqual(0);
      expect(p.claimed).toBeLessThan(12);
      // A photo matches at most one district.
      expect(p.tiles.filter((tile) => tileShows(tile, p.photo)).length).toBeLessThanOrEqual(1);
      expect(p.scenery).toHaveLength(5);
    }
  });

  it('puts a true story’s photo in the captioned district', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('true'), stamp('decisive'));
      expect(p.outcome).toBe('match');
      expect(p.answer).toBe(p.claimed);
      expect(tileShows(p.tiles[p.claimed] as MapTile, p.photo)).toBe(true);
      expect(answerIndex(p)).toBe(p.claimed);
    }
  });

  it('moves a false story’s photo to another district or another town', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('false'), stamp('decisive'));
      seen.add(p.outcome);
      // Never the captioned district.
      expect(tileShows(p.tiles[p.claimed] as MapTile, p.photo)).toBe(false);
      if (p.outcome === 'otherDistrict') {
        expect(p.answer).not.toBeNull();
        expect(p.answer).not.toBe(p.claimed);
        expect(tileShows(p.tiles[p.answer ?? -1] as MapTile, p.photo)).toBe(true);
        expect(answerIndex(p)).toBe(p.answer ?? -1);
      } else {
        expect(p.outcome).toBe('otherTown');
        expect(p.answer).toBeNull();
        expect(answerIndex(p)).toBe(NOT_HERE);
        // No district shows the photo, but one shares a landmark with it: the decoy.
        expect(p.tiles.some((tile) => tileShows(tile, p.photo))).toBe(false);
        expect(p.tiles.some((tile) => sharedLandmarks(tile.landmarks, p.photo) === 1)).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['otherDistrict', 'otherTown']);
  });

  it('always lures an off-map photo with one landmark of the captioned district', () => {
    let nearClaimed = 0;
    let offMap = 0;
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('false'), stamp('decisive'));
      if (p.outcome !== 'otherTown') continue;
      offMap++;
      const claimedTile = p.tiles[p.claimed] as MapTile;
      if (sharedLandmarks(claimedTile.landmarks, p.photo) === 1) nearClaimed++;
    }
    expect(offMap).toBeGreaterThan(0);
    expect(nearClaimed).toBe(offMap);
  });
});

describe('reasons', () => {
  it('explains where the photo was taken', () => {
    expect(t.reasons.match()).toBe('Zdjęcie z miejsca z podpisu.');
    expect(t.reasons.otherDistrict('Rynek', 'Młyny')).toBe('To nie Rynek – to Młyny.');
    expect(t.reasons.otherTown()).toBe('Tych miejsc nie ma w Nowych Brzegach.');
  });
});

describe('reduce', () => {
  it('succeeds on the captioned district for a matching photo', () => {
    const [next, effect] = reduce(initialState(puzzle({})), { type: 'pick', index: 0 });
    expect(next.outcome).toBe('success');
    expect(next.picked).toBe(0);
    expect(effect).toBe('found');
  });

  it('counts the captioned district as a mistake when the photo is from elsewhere', () => {
    const [next, effect] = reduce(initialState(otherDistrict), { type: 'pick', index: 0 });
    expect(next.mistakes).toBe(1);
    expect(next.struck[0]).toBe(true);
    expect(next.outcome).toBe('playing');
    expect(effect).toBe('miss');
    const [found, foundEffect] = reduce(next, { type: 'pick', index: 5 });
    expect(found.outcome).toBe('success');
    expect(foundEffect).toBe('found');
  });

  it('wants „Nie ma na mapie” for an off-map photo', () => {
    const [right, effect] = reduce(initialState(otherTown), { type: 'notHere' });
    expect(right.outcome).toBe('success');
    expect(right.picked).toBe(NOT_HERE);
    expect(effect).toBe('found');
    // „Nie ma na mapie” on a photo from the map is a mistake.
    const [wrong, wrongEffect] = reduce(initialState(otherDistrict), { type: 'notHere' });
    expect(wrong.mistakes).toBe(1);
    expect(wrong.struck[NOT_HERE]).toBe(true);
    expect(wrongEffect).toBe('miss');
  });

  it('fails after two mistakes on Normal', () => {
    const state = initialState(otherTown);
    expect(state.maxMistakes).toBe(GEOLOCATION_MAX_MISTAKES);
    expect(state.maxMistakes).toBe(2);
    const [once] = reduce(state, { type: 'pick', index: 0 });
    const [twice, effect] = reduce(once, { type: 'pick', index: 3 });
    expect(twice.mistakes).toBe(2);
    expect(twice.outcome).toBe('failure');
    expect(effect).toBe('failed');
  });

  it('allows one more mistake on Łatwy and one fewer on Ekspert', () => {
    expect(initialState(otherTown, 'easy').maxMistakes).toBe(3);
    const [next, effect] = reduce(initialState(otherTown, 'expert'), { type: 'pick', index: 2 });
    expect(next.outcome).toBe('failure');
    expect(effect).toBe('failed');
  });

  it('counts a struck district only once', () => {
    const [once] = reduce(initialState(otherTown), { type: 'pick', index: 4 });
    const [again, effect] = reduce(once, { type: 'pick', index: 4 });
    expect(again.mistakes).toBe(1);
    expect(effect).toBe('blocked');
  });

  it('ignores picks outside the map', () => {
    const start = initialState(otherTown);
    expect(reduce(start, { type: 'pick', index: 13 })).toEqual([start, null]);
    expect(reduce(start, { type: 'pick', index: -1 })).toEqual([start, null]);
  });

  it('moves over the 4×3 map and down to the button, and back up to the same column', () => {
    const start = initialState(otherTown);
    expect(start.cursor).toBe(0);
    expect(reduce(start, { type: 'move', dRow: -1, dCol: 0 })).toEqual([start, null]);
    expect(reduce(start, { type: 'move', dRow: 0, dCol: -1 })).toEqual([start, null]);
    const [right, effect] = reduce(start, { type: 'move', dRow: 0, dCol: 1 });
    expect(right.cursor).toBe(1);
    expect(effect).toBe('move');
    const atRightEdge = run(start, [
      { type: 'move', dRow: 0, dCol: 1 },
      { type: 'move', dRow: 0, dCol: 1 },
      { type: 'move', dRow: 0, dCol: 1 },
      { type: 'move', dRow: 0, dCol: 1 },
    ]);
    expect(atRightEdge.cursor).toBe(3);
    const bottom = run(start, [
      { type: 'move', dRow: 0, dCol: 1 },
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 1, dCol: 0 },
    ]);
    expect(bottom.cursor).toBe(9);
    const [atButton] = reduce(bottom, { type: 'move', dRow: 1, dCol: 0 });
    expect(atButton.cursor).toBe(NOT_HERE);
    // Sideways and down stay on the button; up returns to the tile it came from.
    expect(reduce(atButton, { type: 'move', dRow: 0, dCol: 1 })).toEqual([atButton, null]);
    expect(reduce(atButton, { type: 'move', dRow: 1, dCol: 0 })).toEqual([atButton, null]);
    expect(reduce(atButton, { type: 'move', dRow: -1, dCol: 0 })[0].cursor).toBe(9);
    expect(reduce(atButton, { type: 'confirm' })[0].outcome).toBe('success');
  });

  it('confirms the district under the cursor', () => {
    const atFive = run(initialState(otherDistrict), [
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 0, dCol: 1 },
    ]);
    expect(atFive.cursor).toBe(5);
    expect(reduce(atFive, { type: 'confirm' })[0].outcome).toBe('success');
  });

  it('ignores input after the round ends', () => {
    const [done] = reduce(initialState(puzzle({})), { type: 'pick', index: 0 });
    expect(reduce(done, { type: 'pick', index: 1 })).toEqual([done, null]);
    expect(reduce(done, { type: 'move', dRow: 0, dCol: 1 })).toEqual([done, null]);
  });
});
