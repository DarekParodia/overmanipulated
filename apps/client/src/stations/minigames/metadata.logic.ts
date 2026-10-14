// Metadane minigame (S7-52): pure puzzle generation and rules. The folder describes a file
// („Opis w teczce”: when, what with, edited or not, where); the file carries its own data
// („Dane pliku”: four fields). Either exactly one field contradicts the description, or none
// does, or a social site stripped the data. The player taps the contradicting field, or answers
// „Zgadza się” or „Brak danych”.
// Real-world analogue: reading EXIF / file metadata — and knowing that platforms strip it, so
// missing data proves nothing.
import type { Stamp, Story } from '@redakcja/content';
import {
  createRng,
  DEFAULT_DIFFICULTY,
  type Difficulty,
  METADATA_MAX_MISTAKES,
  METADATA_NO_STAMP_WEIGHTS,
  mistakeLimit,
  type StoryType,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { hashText, pick, problemFromStamp, type Rng } from './evidence.ts';

const t = pl.minigames.metadata;

/** The content pools, widened from their literal types. */
type Pair = { readonly claim: string; readonly file: string };
const DEVICES: Record<MediaKind, readonly Pair[]> = t.devices;

/** The `METADATA_FIELDS` file fields, in grid order (row-major, two columns). */
export const METADATA_FIELD_IDS = ['taken', 'device', 'software', 'place'] as const;
export type MetadataField = (typeof METADATA_FIELD_IDS)[number];
export type MetadataOutcome = 'consistent' | 'contradiction' | 'stripped';
export type MediaKind = 'photo' | 'recording' | 'screenshot';

export type MetadataPuzzle = {
  mediaKind: MediaKind;
  /** What the folder says about the file. */
  claim: Record<MetadataField, string>;
  /** What the file's own data says; `null` everywhere when a site stripped it. */
  file: Record<MetadataField, string | null>;
  outcome: MetadataOutcome;
  /** The one field that contradicts the claim (only when `outcome` is `contradiction`). */
  contradiction: MetadataField | null;
};

/** A field, or one of the two foot buttons. */
export type Choice = MetadataField | 'matches' | 'noData';

/** What the player answers. */
export type Answer =
  | { kind: 'field'; field: MetadataField }
  | { kind: 'matches' }
  | { kind: 'noData' };

/** Every choice in cursor order: the 2×2 field grid, then the foot row („Zgadza się”, „Brak danych”). */
export const CHOICES: readonly Choice[] = [...METADATA_FIELD_IDS, 'matches', 'noData'];
/** The cursor grid: two columns, so the 2×2 fields and the two foot buttons line up. */
const GRID_COLUMNS = 2;

const MEDIA_KIND: Record<StoryType, MediaKind> = {
  photo: 'photo',
  recording: 'recording',
  quote: 'screenshot',
  post: 'screenshot',
  statistic: 'screenshot',
  article: 'screenshot',
};

/** Salt of this minigame's seed (each minigame has its own, so puzzles never correlate). */
const SEED_SALT = 0x5eed_000b;

/**
 * The puzzle outcome, consistent with the stamp the station gives: an irrelevant stamp means the
 * data was stripped; a decisive stamp shows a contradiction exactly when the story is untrue; a
 * misleading one points the wrong way. Without a stamp: weighted by `METADATA_NO_STAMP_WEIGHTS`
 * (one RNG draw).
 */
export function metadataOutcome(
  story: Pick<Story, 'truth'>,
  stamp: Pick<Stamp, 'relevance'> | undefined,
  rng: Rng,
): MetadataOutcome {
  if (stamp?.relevance === 'irrelevant') {
    return 'stripped';
  }
  const problem = problemFromStamp(story, stamp);
  if (problem !== null) {
    return problem ? 'contradiction' : 'consistent';
  }
  const weights = METADATA_NO_STAMP_WEIGHTS;
  const roll = rng.next() * (weights.consistent + weights.contradiction + weights.stripped);
  if (roll < weights.consistent) {
    return 'consistent';
  }
  return roll < weights.consistent + weights.contradiction ? 'contradiction' : 'stripped';
}

/**
 * The field a technique's file gives away, when the technique implies one (keys are technique
 * ids and their aliases from `techniques.json`): an old photo under a new caption carries its old
 * date; a generated image was never shot by any device; a deepfake video was put together in a
 * video editor (S7-59). So the puzzle agrees with the Metadane stamp of such a story, which names
 * that field.
 */
export const TECHNIQUE_FIELD: Readonly<Record<string, MetadataField>> = {
  'stare-zdjecie-nowy-podpis': 'taken',
  'zdjecie-w-zlym-czasie': 'taken',
  'obraz-wygenerowany-ai': 'device',
  'deepfake-wideo': 'software',
};

/**
 * Fields a real file (any story that is not false) may contradict: a wrong time or place in the
 * description. Never a generator or a photomontage, which would brand an authentic file a fake.
 */
export const REAL_FILE_FIELDS: readonly MetadataField[] = ['taken', 'place'];

/**
 * The contradicting field of a `contradiction` puzzle: the technique's own field when it has
 * one (no RNG draw); otherwise seeded, over every field for a false story and over
 * `REAL_FILE_FIELDS` for a real file.
 */
export function contradictionField(
  story: Pick<Story, 'truth' | 'technique'>,
  rng: Rng,
): MetadataField {
  const field = TECHNIQUE_FIELD[story.technique];
  if (field) {
    return field;
  }
  return pick(rng, story.truth === 'false' ? METADATA_FIELD_IDS : REAL_FILE_FIELDS);
}

function contradictingValue(
  rng: Rng,
  field: MetadataField,
  mediaKind: MediaKind,
  time: { old: string },
): string {
  switch (field) {
    case 'taken':
      return time.old;
    case 'device':
      return t.generated;
    case 'software':
      return pick(rng, t.software[mediaKind].edited);
    case 'place':
      return pick(rng, t.otherTowns);
  }
}

/** Same seed, story and stamp → same puzzle. */
export function generatePuzzle(
  seed: number,
  story: Pick<Story, 'headline' | 'truth' | 'type' | 'technique'>,
  stamp: Pick<Stamp, 'relevance' | 'text'> | undefined,
): MetadataPuzzle {
  const rng = createRng(seed ^ SEED_SALT ^ hashText(`${story.headline}|${stamp?.text ?? ''}`));
  const mediaKind = MEDIA_KIND[story.type];
  const outcome = metadataOutcome(story, stamp, rng);
  const time = pick(rng, t.times);
  const device = pick(rng, DEVICES[mediaKind]);
  const software = t.software[mediaKind];
  const place = pick(rng, t.places);
  const claim: Record<MetadataField, string> = {
    taken: time.claim,
    device: device.claim,
    software: software.claim,
    place,
  };
  if (outcome === 'stripped') {
    return {
      mediaKind,
      claim,
      file: { taken: null, device: null, software: null, place: null },
      outcome,
      contradiction: null,
    };
  }
  const file: Record<MetadataField, string | null> = {
    taken: time.file,
    device: device.file,
    software: software.clean,
    place,
  };
  if (outcome === 'consistent') {
    return { mediaKind, claim, file, outcome, contradiction: null };
  }
  const contradiction = contradictionField(story, rng);
  file[contradiction] = contradictingValue(rng, contradiction, mediaKind, time);
  return { mediaKind, claim, file, outcome, contradiction };
}

export function isRight(puzzle: MetadataPuzzle, answer: Answer): boolean {
  switch (answer.kind) {
    case 'field':
      return puzzle.outcome === 'contradiction' && puzzle.contradiction === answer.field;
    case 'matches':
      return puzzle.outcome === 'consistent';
    case 'noData':
      return puzzle.outcome === 'stripped';
  }
}

/** The right choice (for `data-answer`, the reveal and e2e). */
export function answerChoice(puzzle: MetadataPuzzle): Choice {
  switch (puzzle.outcome) {
    case 'consistent':
      return 'matches';
    case 'stripped':
      return 'noData';
    case 'contradiction':
      return puzzle.contradiction ?? 'matches';
  }
}

/** The banner line explaining the answer. */
export function reasonKey(puzzle: MetadataPuzzle): keyof typeof t.reasons {
  return puzzle.outcome === 'contradiction'
    ? (puzzle.contradiction ?? 'consistent')
    : puzzle.outcome;
}

function answerFor(choice: Choice): Answer {
  return choice === 'matches' || choice === 'noData'
    ? { kind: choice }
    : { kind: 'field', field: choice };
}

// --- Rules -------------------------------------------------------------------------------

export type Outcome = 'playing' | 'success' | 'failure';

export type GameState = {
  puzzle: MetadataPuzzle;
  /** Index into `CHOICES` (keyboard / gamepad cursor). */
  cursor: number;
  /** Wrong choices, struck through (a second tap costs nothing). */
  struck: Record<Choice, boolean>;
  mistakes: number;
  /** Mistakes that fail the round on this difficulty (`mistakeLimit`, S7-24). */
  maxMistakes: number;
  outcome: Outcome;
  /** What the player chose last. */
  picked: Choice | null;
};

export type Action =
  | { type: 'move'; dRow: number; dCol: number }
  | { type: 'pick'; choice: Choice }
  | { type: 'confirm' };

/** What just happened, for feedback cues. */
export type Effect = 'move' | 'right' | 'mistake' | 'failed' | 'blocked';

export function initialState(
  puzzle: MetadataPuzzle,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): GameState {
  return {
    puzzle,
    cursor: 0,
    struck: {
      taken: false,
      device: false,
      software: false,
      place: false,
      matches: false,
      noData: false,
    },
    mistakes: 0,
    maxMistakes: mistakeLimit(METADATA_MAX_MISTAKES, difficulty),
    outcome: 'playing',
    picked: null,
  };
}

function choose(state: GameState, choice: Choice): [GameState, Effect] {
  const cursor = CHOICES.indexOf(choice);
  if (state.struck[choice]) {
    return [{ ...state, cursor }, 'blocked'];
  }
  if (isRight(state.puzzle, answerFor(choice))) {
    return [{ ...state, cursor, picked: choice, outcome: 'success' }, 'right'];
  }
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= state.maxMistakes;
  return [
    {
      ...state,
      cursor,
      picked: choice,
      struck: { ...state.struck, [choice]: true },
      mistakes,
      outcome: failed ? 'failure' : 'playing',
    },
    failed ? 'failed' : 'mistake',
  ];
}

export function reduce(state: GameState, action: Action): [GameState, Effect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  switch (action.type) {
    case 'move': {
      const rows = Math.ceil(CHOICES.length / GRID_COLUMNS);
      const row = Math.floor(state.cursor / GRID_COLUMNS);
      const col = state.cursor % GRID_COLUMNS;
      const nextRow = Math.max(0, Math.min(rows - 1, row + action.dRow));
      const nextCol = Math.max(0, Math.min(GRID_COLUMNS - 1, col + action.dCol));
      const cursor = Math.min(CHOICES.length - 1, nextRow * GRID_COLUMNS + nextCol);
      if (cursor === state.cursor) {
        return [state, null];
      }
      return [{ ...state, cursor }, 'move'];
    }
    case 'pick':
      return choose(state, action.choice);
    case 'confirm': {
      const choice = CHOICES[state.cursor];
      return choice ? choose(state, choice) : [state, null];
    }
  }
}
