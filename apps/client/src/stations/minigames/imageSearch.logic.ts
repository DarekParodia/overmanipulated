// Image search ("Lupa obrazu", S2-04): pure puzzle generation and play rules.
// The submitted photo is a paper-cut scene of flat shapes built from the seed. Two or three of
// its shapes are marked as fragments. The search results are variants of the scene: exactly one
// is the same photo (possibly cropped); every other one lacks at least one marked fragment
// (recoloured, reshaped, removed, or a different scene altogether). Same seed → same puzzle.
import {
  createRng,
  IMAGE_SEARCH_FRAGMENTS,
  IMAGE_SEARCH_MAX_MISTAKES,
  IMAGE_SEARCH_RESULTS,
} from '@redakcja/shared';

/** Scene size in SVG units (4:3, like a print). */
export const SCENE_WIDTH = 120;
export const SCENE_HEIGHT = 90;

export const shapeKinds = ['disc', 'block', 'roof', 'pole', 'arch'] as const;
export type ShapeKind = (typeof shapeKinds)[number];

/** Paper-cut colours; each maps to a design token in the component. */
export const shapeTones = [
  'ink',
  'inkSoft',
  'manila',
  'cork',
  'wood',
  'copyBlue',
  'ochre',
] as const;
export type ShapeTone = (typeof shapeTones)[number];

export const groundTones = ['paperDeep', 'manilaDark'] as const;
export type GroundTone = (typeof groundTones)[number];

export type Shape = {
  kind: ShapeKind;
  tone: ShapeTone;
  /** Centre. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Scene = {
  ground: GroundTone;
  /** y of the horizon line. */
  horizon: number;
  shapes: readonly Shape[];
};

export type Box = { x: number; y: number; w: number; h: number };

export type ResultDate = { year: number; month: number; day: number };

export type DistractorKind = 'recolour' | 'reshape' | 'remove' | 'otherScene';

export type SearchResult = {
  scene: Scene;
  /** Visible part of the scene (4:3). */
  crop: Box;
  site: string;
  date: ResultDate;
  /** null for the matching result. */
  distractor: DistractorKind | null;
};

export type Puzzle = {
  photo: Scene;
  /** Indices into `photo.shapes` of the marked fragments, in display order. */
  fragments: readonly number[];
  results: readonly SearchResult[];
  /** Index of the result that is the same photo. */
  answer: number;
};

/** Fictional sites of Nowe Brzegi where copies of the photo turn up. */
const SITES = [
  'nowebrzegi.info',
  'forum.nadrzecze.pl',
  'fotokronika-nb.pl',
  'kurier-nowobrzeski.pl/archiwum',
  'tablica.nowebrzegi.pl',
  'nb-fotoarchiwum.pl',
  'spacerem-po-brzegach.pl',
  'pogodynka-nb.pl',
] as const;

const GRID_COLUMNS = 4;
const GRID_ROWS = 3;
const CELL = SCENE_WIDTH / GRID_COLUMNS;
const SHAPES_PER_SCENE = 6;
const JITTER = 3;
const FRAGMENT_MARGIN = 4;
const MIN_CROP_WIDTH = 90;
const CROP_ATTEMPTS = 12;
const FIRST_YEAR = 2014;
const YEAR_SPAN = 12;
const DEFAULT_MATCH_YEAR = 2019;

type Rng = ReturnType<typeof createRng>;

function pickOne<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.int(items.length)];
  if (item === undefined) {
    throw new Error('pickOne: empty list');
  }
  return item;
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy;
}

function range(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function shapeSize(rng: Rng, kind: ShapeKind): { w: number; h: number } {
  switch (kind) {
    case 'disc': {
      const d = range(rng, 13, 20);
      return { w: d, h: d };
    }
    case 'block':
      return { w: range(rng, 12, 20), h: range(rng, 10, 20) };
    case 'roof': {
      const w = range(rng, 15, 21);
      return { w, h: w * 0.7 };
    }
    case 'pole':
      return { w: range(rng, 4, 6), h: range(rng, 18, 23) };
    case 'arch': {
      const w = range(rng, 13, 19);
      return { w, h: w * 0.95 };
    }
  }
}

function makeShape(rng: Rng, cell: number, kind: ShapeKind, tone: ShapeTone): Shape {
  const column = cell % GRID_COLUMNS;
  const row = Math.floor(cell / GRID_COLUMNS);
  const { w, h } = shapeSize(rng, kind);
  return {
    kind,
    tone,
    x: round1(CELL * (column + 0.5) + range(rng, -JITTER, JITTER)),
    y: round1(CELL * (row + 0.5) + range(rng, -JITTER, JITTER)),
    w: round1(w),
    h: round1(h),
  };
}

function makeScene(rng: Rng): Scene {
  const cells = shuffled(
    rng,
    Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, i) => i),
  ).slice(0, SHAPES_PER_SCENE);
  // Unique kind/tone pairs keep every shape distinguishable from the others.
  const combos = shuffled(
    rng,
    shapeKinds.flatMap((kind) => shapeTones.map((tone) => ({ kind, tone }))),
  );
  const shapes = cells.map((cell, i) => {
    const combo = combos[i] ?? { kind: 'disc' as const, tone: 'ink' as const };
    return makeShape(rng, cell, combo.kind, combo.tone);
  });
  return {
    ground: pickOne(rng, groundTones),
    horizon: Math.round(range(rng, 54, 68)),
    shapes,
  };
}

export function shapeBox(shape: Shape, margin = 0): Box {
  return {
    x: shape.x - shape.w / 2 - margin,
    y: shape.y - shape.h / 2 - margin,
    w: shape.w + margin * 2,
    h: shape.h + margin * 2,
  };
}

/** Square area around a fragment, used by the loupe and the marks. */
export function fragmentBox(shape: Shape): Box {
  const size = Math.max(shape.w, shape.h) + FRAGMENT_MARGIN * 2;
  return { x: shape.x - size / 2, y: shape.y - size / 2, w: size, h: size };
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

const FULL_FRAME: Box = { x: 0, y: 0, w: SCENE_WIDTH, h: SCENE_HEIGHT };

/** A random 4:3 crop that keeps every given shape fully visible (full frame as a fallback). */
function cropKeeping(rng: Rng, keep: readonly Shape[]): Box {
  for (let attempt = 0; attempt < CROP_ATTEMPTS; attempt++) {
    const w = round1(range(rng, MIN_CROP_WIDTH, SCENE_WIDTH));
    const h = round1((w * SCENE_HEIGHT) / SCENE_WIDTH);
    const crop = {
      x: round1(range(rng, 0, SCENE_WIDTH - w)),
      y: round1(range(rng, 0, SCENE_HEIGHT - h)),
      w,
      h,
    };
    if (keep.every((shape) => inside(shapeBox(shape), crop))) {
      return crop;
    }
  }
  return FULL_FRAME;
}

function sameShape(a: Shape, b: Shape): boolean {
  return (
    a.kind === b.kind &&
    a.tone === b.tone &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h
  );
}

/** Whether the result shows this shape of the submitted photo, unchanged and in frame. */
export function resultShows(result: SearchResult, shape: Shape): boolean {
  return (
    result.scene.shapes.some((s) => sameShape(s, shape)) && inside(shapeBox(shape), result.crop)
  );
}

/** Positions (0-based, in `puzzle.fragments` order) of the fragments a result lacks. */
export function missingFragments(puzzle: Puzzle, resultIndex: number): number[] {
  const result = puzzle.results[resultIndex];
  if (!result) {
    return [];
  }
  const missing: number[] = [];
  puzzle.fragments.forEach((shapeIndex, position) => {
    const shape = puzzle.photo.shapes[shapeIndex];
    if (shape && !resultShows(result, shape)) {
      missing.push(position);
    }
  });
  return missing;
}

function alter(rng: Rng, photo: Scene, target: number, kind: DistractorKind): Scene {
  if (kind === 'otherScene') {
    return makeScene(rng);
  }
  const shapes = photo.shapes.flatMap((shape, i) => {
    if (i !== target) {
      return [shape];
    }
    if (kind === 'remove') {
      return [];
    }
    if (kind === 'recolour') {
      return [
        {
          ...shape,
          tone: pickOne(
            rng,
            shapeTones.filter((t) => TONE_FAMILY[t] !== TONE_FAMILY[shape.tone]),
          ),
        },
      ];
    }
    const other = pickOne(
      rng,
      shapeKinds.filter((k) => k !== shape.kind),
    );
    const size = shapeSize(rng, other);
    return [{ ...shape, kind: other, w: round1(size.w), h: round1(size.h) }];
  });
  return { ...photo, shapes };
}

function randomDate(rng: Rng, year: number): ResultDate {
  return { year, month: 1 + rng.int(12), day: 1 + rng.int(28) };
}

/** A four-digit year mentioned in the stamp text ("…w 2019 r."), if any. */
export function yearFromText(text: string | undefined): number | null {
  const match = text?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

/** Tones that read alike at thumbnail size; a recolour always jumps to another family. */
const TONE_FAMILY: Record<ShapeTone, string> = {
  ink: 'dark',
  inkSoft: 'dark',
  cork: 'brown',
  wood: 'brown',
  manila: 'light',
  ochre: 'ochre',
  copyBlue: 'blue',
};

const DISTRACTOR_KINDS: readonly DistractorKind[] = ['recolour', 'reshape', 'remove', 'otherScene'];

export function createPuzzle(seed: number, matchYear: number = DEFAULT_MATCH_YEAR): Puzzle {
  const rng = createRng(seed);
  const photo = makeScene(rng);
  const fragmentCount =
    IMAGE_SEARCH_FRAGMENTS.min +
    rng.int(IMAGE_SEARCH_FRAGMENTS.max - IMAGE_SEARCH_FRAGMENTS.min + 1);
  const fragments = shuffled(
    rng,
    photo.shapes.map((_, i) => i),
  ).slice(0, fragmentCount);
  const fragmentShapes = fragments.flatMap((i) => photo.shapes[i] ?? []);
  const resultCount =
    IMAGE_SEARCH_RESULTS.min + rng.int(IMAGE_SEARCH_RESULTS.max - IMAGE_SEARCH_RESULTS.min + 1);
  const answer = rng.int(resultCount);
  const sites = shuffled(rng, SITES);
  const firstKind = rng.int(DISTRACTOR_KINDS.length);

  const results: SearchResult[] = [];
  let distractorIndex = 0;
  let alteredIndex = 0;
  for (let i = 0; i < resultCount; i++) {
    const site = sites[i % sites.length] ?? SITES[0];
    if (i === answer) {
      results.push({
        scene: photo,
        crop: cropKeeping(rng, fragmentShapes),
        site,
        date: randomDate(rng, matchYear),
        distractor: null,
      });
      continue;
    }
    const kind =
      DISTRACTOR_KINDS[(firstKind + distractorIndex) % DISTRACTOR_KINDS.length] ?? 'remove';
    // Rotate which fragment is altered so every fragment matters; a different scene lacks all of
    // them anyway, so it does not take a turn.
    const target = fragments[alteredIndex % fragments.length] ?? 0;
    distractorIndex++;
    if (kind !== 'otherScene') {
      alteredIndex++;
    }
    let scene = alter(rng, photo, target, kind);
    const year = FIRST_YEAR + rng.int(YEAR_SPAN);
    const draft: SearchResult = {
      scene,
      crop: kind === 'otherScene' ? cropKeeping(rng, []) : cropKeeping(rng, fragmentShapes),
      site,
      date: randomDate(rng, year),
      distractor: kind,
    };
    // A brand-new scene cannot realistically repeat a fragment exactly, but make sure.
    while (fragmentShapes.every((shape) => resultShows({ ...draft, scene }, shape))) {
      scene = makeScene(rng);
    }
    results.push({ ...draft, scene });
  }
  return { photo, fragments, results, answer };
}

// --- Play rules ----------------------------------------------------------------------------

export type PlayState = {
  /** Focused result (keyboard/gamepad). */
  cursor: number;
  /** Fragment shown in the loupe (position in `puzzle.fragments`). */
  fragment: number;
  mistakes: number;
  /** Results already picked wrongly, in pick order. */
  ruledOut: readonly number[];
  solved: boolean;
  failed: boolean;
};

export type PickOutcome = 'match' | 'miss' | 'fail' | 'ignored';

export function initialPlay(): PlayState {
  return { cursor: 0, fragment: 0, mistakes: 0, ruledOut: [], solved: false, failed: false };
}

export function isOver(state: PlayState): boolean {
  return state.solved || state.failed;
}

export function pick(
  state: PlayState,
  puzzle: Puzzle,
  index: number,
): { state: PlayState; outcome: PickOutcome } {
  if (
    isOver(state) ||
    index < 0 ||
    index >= puzzle.results.length ||
    state.ruledOut.includes(index)
  ) {
    return { state, outcome: 'ignored' };
  }
  if (index === puzzle.answer) {
    return { state: { ...state, cursor: index, solved: true }, outcome: 'match' };
  }
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= IMAGE_SEARCH_MAX_MISTAKES;
  return {
    state: { ...state, cursor: index, mistakes, ruledOut: [...state.ruledOut, index], failed },
    outcome: failed ? 'fail' : 'miss',
  };
}

export function nextFragment(state: PlayState, puzzle: Puzzle): PlayState {
  const count = Math.max(1, puzzle.fragments.length);
  return { ...state, fragment: (state.fragment + 1) % count };
}

/** Grid columns for the result printouts (four fit in one row); keyboard navigation follows it. */
export function resultColumns(count: number): number {
  return count <= 4 ? count : 3;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Moves the focus in the result grid; stops at the edges instead of wrapping. */
export function moveCursor(cursor: number, direction: Direction, count: number): number {
  const columns = resultColumns(count);
  const column = cursor % columns;
  let next = cursor;
  if (direction === 'left' && column > 0) next = cursor - 1;
  if (direction === 'right' && column < columns - 1) next = cursor + 1;
  if (direction === 'up') next = cursor - columns;
  if (direction === 'down') next = cursor + columns;
  return next >= 0 && next < count ? next : cursor;
}
