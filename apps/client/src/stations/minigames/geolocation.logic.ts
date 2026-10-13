// Mapa minigame (S7-55): pure puzzle generation and rules. The folder's photo shows two
// landmarks and carries a caption naming a district of Nowe Brzegi; the town map is a 4×3 grid of
// districts, each with its own two landmarks. The player taps the district whose two landmarks
// both stand in the photo, or answers „Nie ma na mapie” when no district has both.
// Real-world analogue: geolocation — matching what a photo shows against maps and street imagery
// to check where it was really taken.
import type { Stamp, Story } from '@redakcja/content';
import {
  createRng,
  DEFAULT_DIFFICULTY,
  type Difficulty,
  GEOLOCATION_MAP,
  GEOLOCATION_MAX_MISTAKES,
  GEOLOCATION_OTHER_DISTRICT_SHARE,
  GEOLOCATION_PROBLEM_CHANCE,
  mistakeLimit,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { hashText, pick, problemFromStamp, type Rng, shuffled } from './evidence.ts';

/** The ten landmark silhouettes (landmarks.tsx draws each one; told apart by shape alone). */
export const LANDMARKS = [
  'clockTower',
  'archBridge',
  'fountain',
  'tramStop',
  'twinChurch',
  'waterTower',
  'portCrane',
  'windmill',
  'lighthouse',
  'monument',
] as const;
export type Landmark = (typeof LANDMARKS)[number];
export type LandmarkPair = readonly [Landmark, Landmark];

export type MapTile = { district: string; landmarks: LandmarkPair };

/**
 * Where the photo was really taken: the captioned district (`match`), another district of the
 * map (`otherDistrict`), or somewhere off the map (`otherTown`).
 */
export type GeoOutcome = 'match' | 'otherDistrict' | 'otherTown';

/** One background prop of the photo (seeded, drawn behind the landmarks). */
export type Scenery = {
  kind: 'house' | 'tree';
  /** Centre x in photo units (`PHOTO_SIZE`). */
  x: number;
  /** Width and height in photo units. */
  w: number;
  h: number;
};

export type GeoPuzzle = {
  /** `GEOLOCATION_MAP.columns × rows` districts, row-major; every landmark pair is unique. */
  tiles: readonly MapTile[];
  /** The district the caption names. */
  claimed: number;
  /** The two landmarks the photo shows, left to right. */
  photo: LandmarkPair;
  /** The district the photo was really taken in; `null` when it is not on the map. */
  answer: number | null;
  outcome: GeoOutcome;
  /** Houses and trees behind the landmarks. */
  scenery: readonly Scenery[];
};

/** The photo's drawing size in SVG units (4:3). */
export const PHOTO_SIZE = { width: 160, height: 120 } as const;
/** Horizon of the photo: the ground line the landmarks and the scenery stand on. */
export const PHOTO_GROUND_Y = 100;

/** Salt of this minigame's seed (each minigame has its own, so puzzles never correlate). */
const SEED_SALT = 0x5eed_0008;

export const TILE_COUNT = GEOLOCATION_MAP.columns * GEOLOCATION_MAP.rows;
/** Cursor index of the „Nie ma na mapie” button, after the tiles. */
export const NOT_HERE = TILE_COUNT;

/** Every unordered pair of distinct landmarks (10 choose 2 = 45), in a fixed order. */
export const LANDMARK_PAIRS: readonly LandmarkPair[] = LANDMARKS.flatMap((a, i) =>
  LANDMARKS.slice(i + 1).map((b): LandmarkPair => [a, b]),
);

function samePair(a: LandmarkPair, b: LandmarkPair): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

/** How many landmarks two pairs share (0, 1 or 2). */
export function sharedLandmarks(a: LandmarkPair, b: readonly Landmark[]): number {
  return a.filter((landmark) => b.includes(landmark)).length;
}

/** A tile shows the photo when both of its landmarks stand in it. */
export function tileShows(tile: MapTile, photo: readonly Landmark[]): boolean {
  return sharedLandmarks(tile.landmarks, photo) === 2;
}

/**
 * The outcome, consistent with the stamp the station gives: the photo is from elsewhere exactly
 * when `problemFromStamp` says the station shows a problem. Without a stamp it rolls
 * `GEOLOCATION_PROBLEM_CHANCE`; a photo from elsewhere then comes from another district with
 * `GEOLOCATION_OTHER_DISTRICT_SHARE`, else from another town (one more draw).
 */
export function geolocationOutcome(
  story: Pick<Story, 'truth'>,
  stamp: Pick<Stamp, 'relevance'> | undefined,
  rng: Rng,
): GeoOutcome {
  const problem = problemFromStamp(story, stamp) ?? rng.next() < GEOLOCATION_PROBLEM_CHANCE;
  if (!problem) {
    return 'match';
  }
  return rng.next() < GEOLOCATION_OTHER_DISTRICT_SHARE ? 'otherDistrict' : 'otherTown';
}

/**
 * A photo from another town: a pair no tile has that shares exactly one landmark with the
 * captioned district, so one familiar landmark lures the player onto the map. Such a pair always
 * exists: 16 pairs share one landmark with the captioned pair and only 11 other tiles can use them.
 */
function decoyPair(rng: Rng, tiles: readonly MapTile[], claimed: number): LandmarkPair {
  const claimedPair = tileAt(tiles, claimed).landmarks;
  const decoys = LANDMARK_PAIRS.filter(
    (pair) =>
      sharedLandmarks(pair, claimedPair) === 1 &&
      !tiles.some((tile) => samePair(tile.landmarks, pair)),
  );
  return pick(rng, decoys);
}

/** Shape ranges of the photo's background props, in photo units (presentation only). */
const SCENERY = {
  count: 5,
  /** Share of props that are houses (the rest are trees). */
  houseShare: 0.5,
  /** How far a prop may drift from the centre of its slot, as a share of the slot width. */
  jitter: 0.5,
  house: { minW: 20, spanW: 10, minH: 16, spanH: 12 },
  tree: { minW: 12, spanW: 6, minH: 18, spanH: 10 },
} as const;

function generateScenery(rng: Rng): Scenery[] {
  const slot = PHOTO_SIZE.width / SCENERY.count;
  return Array.from({ length: SCENERY.count }, (_, i): Scenery => {
    const kind = rng.next() < SCENERY.houseShare ? 'house' : 'tree';
    const size = SCENERY[kind];
    const x = slot * (i + 0.5) + (rng.next() - 0.5) * slot * SCENERY.jitter;
    return {
      kind,
      x,
      w: size.minW + rng.int(size.spanW),
      h: size.minH + rng.int(size.spanH),
    };
  });
}

function tileAt(tiles: readonly MapTile[], index: number): MapTile {
  const tile = tiles[index];
  if (!tile) {
    throw new Error(`no map tile ${index}`);
  }
  return tile;
}

/** Same seed, story and stamp → same puzzle. */
export function generatePuzzle(
  seed: number,
  story: Pick<Story, 'headline' | 'truth'>,
  stamp: Pick<Stamp, 'relevance' | 'text'> | undefined,
): GeoPuzzle {
  const rng = createRng(seed ^ SEED_SALT ^ hashText(`${story.headline}|${stamp?.text ?? ''}`));
  const outcome = geolocationOutcome(story, stamp, rng);
  // The first 12 of the 45 shuffled pairs: every tile's pair is unique, so a photo of two
  // landmarks matches at most one district.
  const pairs = shuffled(rng, LANDMARK_PAIRS).slice(0, TILE_COUNT);
  const districts = shuffled(rng, pl.minigames.geolocation.districts);
  const tiles = pairs.map((landmarks, i): MapTile => ({ district: districts[i] ?? '', landmarks }));
  const claimed = rng.int(TILE_COUNT);
  let answer: number | null;
  let pair: LandmarkPair;
  switch (outcome) {
    case 'match':
      answer = claimed;
      pair = tileAt(tiles, claimed).landmarks;
      break;
    case 'otherDistrict': {
      // Any tile but the claimed one: draw over the other 11 and step past the claimed index.
      const other = rng.int(TILE_COUNT - 1);
      answer = other >= claimed ? other + 1 : other;
      pair = tileAt(tiles, answer).landmarks;
      break;
    }
    case 'otherTown':
      answer = null;
      pair = decoyPair(rng, tiles, claimed);
      break;
  }
  // Left-to-right order in the photo is free: shapes, not positions, identify a place.
  const photo: LandmarkPair = rng.int(2) === 0 ? pair : [pair[1], pair[0]];
  return { tiles, claimed, photo, answer, outcome, scenery: generateScenery(rng) };
}

/** The right cursor index: the answer tile, or the „Nie ma na mapie” button. */
export function answerIndex(puzzle: GeoPuzzle): number {
  return puzzle.answer ?? NOT_HERE;
}

// --- Rules -------------------------------------------------------------------------------

export type Outcome = 'playing' | 'success' | 'failure';

export type GameState = {
  puzzle: GeoPuzzle;
  /** 0..11 a tile (row-major), 12 the „Nie ma na mapie” button (keyboard / gamepad cursor). */
  cursor: number;
  /** The tile the cursor left when it moved down to the button, to return to on „up”. */
  lastTile: number;
  /** Wrong picks by cursor index, struck through (a second tap costs nothing). */
  struck: readonly boolean[];
  mistakes: number;
  /** Mistakes that fail the round on this difficulty (`mistakeLimit`, S7-24). */
  maxMistakes: number;
  outcome: Outcome;
  /** What the player picked last (cursor index). */
  picked: number | null;
};

export type Action =
  | { type: 'move'; dRow: number; dCol: number }
  | { type: 'pick'; index: number }
  | { type: 'notHere' }
  | { type: 'confirm' };

/** What just happened, for feedback cues. */
export type Effect = 'move' | 'found' | 'miss' | 'failed' | 'blocked';

export function initialState(
  puzzle: GeoPuzzle,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): GameState {
  return {
    puzzle,
    cursor: 0,
    lastTile: 0,
    struck: Array.from({ length: TILE_COUNT + 1 }, () => false),
    mistakes: 0,
    maxMistakes: mistakeLimit(GEOLOCATION_MAX_MISTAKES, difficulty),
    outcome: 'playing',
    picked: null,
  };
}

function choose(state: GameState, index: number): [GameState, Effect | null] {
  if (index < 0 || index > NOT_HERE) {
    return [state, null];
  }
  const lastTile = index < TILE_COUNT ? index : state.lastTile;
  if (state.struck[index]) {
    return [{ ...state, cursor: index, lastTile }, 'blocked'];
  }
  if (index === answerIndex(state.puzzle)) {
    return [{ ...state, cursor: index, lastTile, picked: index, outcome: 'success' }, 'found'];
  }
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= state.maxMistakes;
  return [
    {
      ...state,
      cursor: index,
      lastTile,
      picked: index,
      struck: state.struck.map((struck, i) => struck || i === index),
      mistakes,
      outcome: failed ? 'failure' : 'playing',
    },
    failed ? 'failed' : 'miss',
  ];
}

function move(state: GameState, dRow: number, dCol: number): number {
  const { columns, rows } = GEOLOCATION_MAP;
  if (state.cursor === NOT_HERE) {
    // The button sits under the map: only „up” leaves it, back to the tile it came from.
    return dRow < 0 ? state.lastTile : NOT_HERE;
  }
  const row = Math.floor(state.cursor / columns);
  const col = state.cursor % columns;
  if (row + dRow >= rows) {
    return NOT_HERE;
  }
  const nextRow = Math.max(0, row + dRow);
  const nextCol = Math.max(0, Math.min(columns - 1, col + dCol));
  return nextRow * columns + nextCol;
}

export function reduce(state: GameState, action: Action): [GameState, Effect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  switch (action.type) {
    case 'move': {
      const cursor = move(state, action.dRow, action.dCol);
      if (cursor === state.cursor) {
        return [state, null];
      }
      const lastTile = cursor < TILE_COUNT ? cursor : state.cursor;
      return [{ ...state, cursor, lastTile }, 'move'];
    }
    case 'pick':
      return choose(state, action.index);
    case 'notHere':
      return choose(state, NOT_HERE);
    case 'confirm':
      return choose(state, state.cursor);
  }
}
