// Stenogram minigame (S7-53): pure puzzle generation and rules. The folder quotes a clip; the
// full record of what was said has `TRANSCRIPT_LINES` numbered lines. Two phases:
// - find: tap the line the clip comes from, or answer „Nie ma w zapisie” when nobody said it;
// - judge (only after the right line): does the cut change the meaning? „Sens ten sam” or
//   „Sens zmieniony”. The words the clip left out are marked on the found line (`cutWords`).
// Real-world analogue: checking a quote against the full transcript or recording, not a
// fragment cut out of it.
import type { Stamp, Story } from '@redakcja/content';
import {
  createRng,
  DEFAULT_DIFFICULTY,
  type Difficulty,
  mistakeLimit,
  TRANSCRIPT_LINES,
  TRANSCRIPT_MAX_MISTAKES,
  TRANSCRIPT_PROBLEM_CHANCE,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { hashText, pick, problemFromStamp, type Rng, shuffled } from './evidence.ts';

const t = pl.minigames.transcript;

/** fair: a shortening that keeps the meaning; cut: the cut flips it; absent: nobody said it. */
export type TranscriptVariant = 'fair' | 'cut' | 'absent';

export type TranscriptPuzzle = {
  /** Where the record comes from (chip above the lines). */
  setting: string;
  /** The quote in the folder. */
  clip: string;
  /** The full record, `TRANSCRIPT_LINES` lines. */
  lines: readonly string[];
  /** The line the clip comes from; `null` when the clip is absent (a decoy line stands in). */
  answerLine: number | null;
  variant: TranscriptVariant;
};

/** Salt of this minigame's seed (each minigame has its own, so puzzles never correlate). */
const SEED_SALT = 0x5eed_0009;

/**
 * The puzzle variant, consistent with the stamp the station gives: a problem (decisive stamp on
 * an untrue story, misleading stamp on a true one) is an invented quote for a false or
 * unverifiable story and a meaning-changing cut otherwise; no problem is a fair shortening.
 * Without a stamp: a problem with `TRANSCRIPT_PROBLEM_CHANCE` (one RNG draw).
 */
export function transcriptVariant(
  story: Pick<Story, 'truth'>,
  stamp: Pick<Stamp, 'relevance'> | undefined,
  rng: Rng,
): TranscriptVariant {
  const problem = problemFromStamp(story, stamp) ?? rng.next() < TRANSCRIPT_PROBLEM_CHANCE;
  if (!problem) {
    return 'fair';
  }
  return story.truth === 'false' || story.truth === 'unverifiable' ? 'absent' : 'cut';
}

/** A record line and the clip quoted from it. */
type QuotePair = { readonly line: string; readonly clip: string };

/** An invented clip and the decoy line that stands in the record instead of it. */
function absentEntry(rng: Rng): QuotePair {
  const { clip, decoy } = pick(rng, t.absent);
  return { clip, line: decoy };
}

/** Same seed, story and stamp → same puzzle. */
export function generatePuzzle(
  seed: number,
  story: Pick<Story, 'headline' | 'truth'>,
  stamp: Pick<Stamp, 'relevance' | 'text'> | undefined,
): TranscriptPuzzle {
  const rng = createRng(seed ^ SEED_SALT ^ hashText(`${story.headline}|${stamp?.text ?? ''}`));
  const variant = transcriptVariant(story, stamp, rng);
  const setting = pick(rng, t.settings);
  const pool: readonly QuotePair[] = variant === 'cut' ? t.cut : t.fair;
  const { clip, line } = variant === 'absent' ? absentEntry(rng) : pick(rng, pool);
  const lines: string[] = shuffled(rng, t.filler).slice(0, TRANSCRIPT_LINES - 1);
  const at = rng.int(TRANSCRIPT_LINES);
  lines.splice(at, 0, line);
  return { setting, clip, lines, answerLine: variant === 'absent' ? null : at, variant };
}

/** One word of a record line, marked when the clip left it out. */
export type Segment = { text: string; cut: boolean };

/** A word compared without case and punctuation („Nie,” equals „nie”). */
function wordKey(word: string): string {
  return word.toLocaleLowerCase('pl').replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * The record line split into words, each marked `cut` when the clip does not keep it (a longest
 * common subsequence of the words). A bare punctuation mark („–”) is cut when a neighbouring
 * word is, so it stays plain between two kept words.
 */
export function cutWords(line: string, clip: string): Segment[] {
  const words = line.split(/\s+/).filter((word) => word !== '');
  const keys = words.map(wordKey);
  const clipKeys = clip
    .split(/\s+/)
    .map(wordKey)
    .filter((key) => key !== '');
  const realWords = keys.flatMap((key, i) => (key === '' ? [] : [i]));
  const a = keys.filter((key) => key !== '');
  // lcs[i][j]: longest common subsequence of a[i..] and clipKeys[j..].
  const lcs = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(clipKeys.length + 1).fill(0),
  );
  const at = (i: number, j: number) => lcs[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = clipKeys.length - 1; j >= 0; j--) {
      const row = lcs[i];
      if (row) {
        row[j] = a[i] === clipKeys[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
      }
    }
  }
  const cut = new Array<boolean>(words.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < clipKeys.length && a[i] === clipKeys[j] && at(i, j) === at(i + 1, j + 1) + 1) {
      i++;
      j++;
    } else if (j >= clipKeys.length || at(i + 1, j) >= at(i, j + 1)) {
      const word = realWords[i];
      if (word !== undefined) {
        cut[word] = true;
      }
      i++;
    } else {
      j++;
    }
  }
  return words.map((text, k) => {
    if (keys[k] !== '') {
      return { text, cut: cut[k] ?? false };
    }
    return { text, cut: (cut[k - 1] ?? false) || (cut[k + 1] ?? false) };
  });
}

/** How many of the clip's words appear, in order, in `line` (the clip comes from it when all do). */
export function keptWordCount(line: string, clip: string): number {
  return cutWords(line, clip).filter((segment) => !segment.cut && wordKey(segment.text) !== '')
    .length;
}

// --- Rules -------------------------------------------------------------------------------

export type Phase = 'find' | 'judge';
export type Outcome = 'playing' | 'success' | 'failure';

/** A pick in the find phase: a line index or „Nie ma w zapisie”. */
export type FindChoice = number | 'absent';
/** A pick in the judge phase. */
export type Judgement = 'same' | 'changed';

export type GameState = {
  puzzle: TranscriptPuzzle;
  phase: Phase;
  /** Find: 0..lines-1 are the lines, `lines` is „Nie ma w zapisie”. Judge: 0 same, 1 changed. */
  cursor: number;
  /** Wrong lines, struck through (a second tap costs nothing). */
  struckLines: readonly boolean[];
  absentStruck: boolean;
  judgeStruck: Record<Judgement, boolean>;
  mistakes: number;
  /** Mistakes that fail the round on this difficulty (`mistakeLimit`, S7-24). */
  maxMistakes: number;
  outcome: Outcome;
};

export type Action =
  | { type: 'move'; dRow: number; dCol: number }
  | { type: 'pickLine'; index: number }
  | { type: 'notInTranscript' }
  | { type: 'judge'; changed: boolean }
  | { type: 'confirm' };

/** What just happened, for feedback cues. */
export type Effect = 'move' | 'found' | 'right' | 'mistake' | 'failed' | 'blocked';

/** The record's cursor grid: two columns, so the 2×2 lines and the foot button line up. */
const GRID_COLUMNS = 2;
export const JUDGEMENTS: readonly Judgement[] = ['same', 'changed'];

export function initialState(
  puzzle: TranscriptPuzzle,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): GameState {
  return {
    puzzle,
    phase: 'find',
    cursor: 0,
    struckLines: puzzle.lines.map(() => false),
    absentStruck: false,
    judgeStruck: { same: false, changed: false },
    mistakes: 0,
    maxMistakes: mistakeLimit(TRANSCRIPT_MAX_MISTAKES, difficulty),
    outcome: 'playing',
  };
}

/** The right judgement for a clip that was found (a fair shortening keeps the meaning). */
export function rightJudgement(puzzle: TranscriptPuzzle): Judgement {
  return puzzle.variant === 'fair' ? 'same' : 'changed';
}

/**
 * The right target in the current phase, as the test-id suffix of its button: `line-<i>`,
 * `absent`, `same` or `changed` (for `data-answer`, the reveal and e2e).
 */
export function answerTarget(state: Pick<GameState, 'puzzle' | 'phase'>): string {
  const { puzzle } = state;
  if (state.phase === 'judge') {
    return rightJudgement(puzzle);
  }
  return puzzle.answerLine === null ? 'absent' : `line-${puzzle.answerLine}`;
}

function mistake(state: GameState, patch: Partial<GameState>): [GameState, Effect] {
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= state.maxMistakes;
  return [
    { ...state, ...patch, mistakes, outcome: failed ? 'failure' : 'playing' },
    failed ? 'failed' : 'mistake',
  ];
}

function find(state: GameState, choice: FindChoice): [GameState, Effect | null] {
  if (state.phase !== 'find') {
    return [state, null];
  }
  const { puzzle } = state;
  if (choice === 'absent') {
    const cursor = puzzle.lines.length;
    if (state.absentStruck) {
      return [{ ...state, cursor }, 'blocked'];
    }
    if (puzzle.answerLine === null) {
      return [{ ...state, cursor, outcome: 'success' }, 'right'];
    }
    return mistake(state, { cursor, absentStruck: true });
  }
  if (choice < 0 || choice >= puzzle.lines.length) {
    return [state, null];
  }
  if (state.struckLines[choice]) {
    return [{ ...state, cursor: choice }, 'blocked'];
  }
  if (choice === puzzle.answerLine) {
    return [{ ...state, phase: 'judge', cursor: 0 }, 'found'];
  }
  const struckLines = state.struckLines.map((struck, i) => struck || i === choice);
  return mistake(state, { cursor: choice, struckLines });
}

function judge(state: GameState, judgement: Judgement): [GameState, Effect | null] {
  if (state.phase !== 'judge') {
    return [state, null];
  }
  const cursor = JUDGEMENTS.indexOf(judgement);
  if (state.judgeStruck[judgement]) {
    return [{ ...state, cursor }, 'blocked'];
  }
  if (judgement === rightJudgement(state.puzzle)) {
    return [{ ...state, cursor, outcome: 'success' }, 'right'];
  }
  return mistake(state, { cursor, judgeStruck: { ...state.judgeStruck, [judgement]: true } });
}

function move(state: GameState, dRow: number, dCol: number): [GameState, Effect | null] {
  let cursor: number;
  if (state.phase === 'judge') {
    cursor = Math.max(0, Math.min(JUDGEMENTS.length - 1, state.cursor + dCol));
  } else {
    const count = state.puzzle.lines.length + 1;
    const rows = Math.ceil(count / GRID_COLUMNS);
    const row = Math.floor(state.cursor / GRID_COLUMNS);
    const col = state.cursor % GRID_COLUMNS;
    const nextRow = Math.max(0, Math.min(rows - 1, row + dRow));
    const nextCol = Math.max(0, Math.min(GRID_COLUMNS - 1, col + dCol));
    cursor = Math.min(count - 1, nextRow * GRID_COLUMNS + nextCol);
  }
  if (cursor === state.cursor) {
    return [state, null];
  }
  return [{ ...state, cursor }, 'move'];
}

export function reduce(state: GameState, action: Action): [GameState, Effect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  switch (action.type) {
    case 'move':
      return move(state, action.dRow, action.dCol);
    case 'pickLine':
      return find(state, action.index);
    case 'notInTranscript':
      return find(state, 'absent');
    case 'judge':
      return judge(state, action.changed ? 'changed' : 'same');
    case 'confirm': {
      if (state.phase === 'judge') {
        const judgement = JUDGEMENTS[state.cursor];
        return judgement ? judge(state, judgement) : [state, null];
      }
      return find(state, state.cursor < state.puzzle.lines.length ? state.cursor : 'absent');
    }
  }
}
