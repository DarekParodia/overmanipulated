// Data library minigame („Biblioteka danych”, S4-03): pure puzzle generation and rules.
// A cartoon table of the ORIGINAL numbers (rows × years + an average column) and one figure
// quoted in the story. Either the figure matches exactly one cell, or it was manipulated in one
// of five ways. The player taps the matching cell or reports „nie pasuje”.
// Real-world analogue: checking a statistic against the original table — right number, wrong
// year, wrong row, wrong unit, a best year passed off as the average, or a number made up.
import type { Stamp, Story } from '@redakcja/content';
import {
  createRng,
  DATA_LIBRARY_ALTERED_CHANCE,
  DATA_LIBRARY_MAX_MISTAKES,
  DATA_LIBRARY_ROWS,
  DATA_LIBRARY_YEARS,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { cardHasFlags } from './sourceRegistry.logic.ts';

type Rng = ReturnType<typeof createRng>;

export type MismatchKind = 'wrongYear' | 'wrongRow' | 'wrongUnit' | 'cherryPick' | 'invented';
export type Verdict = 'match' | MismatchKind;

export const MISMATCH_KINDS: readonly MismatchKind[] = [
  'wrongYear',
  'wrongRow',
  'wrongUnit',
  'cherryPick',
  'invented',
];

export type Topic = (typeof pl.minigames.dataLibrary.topics)[number];

export type DataTable = {
  title: string;
  unit: string;
  rowLabels: string[];
  years: number[];
  /** `values[row][col]`; columns are the years, then the average as the last one. */
  values: number[][];
};

/** What the story quotes: a figure, said to come from one cell of the table. */
export type Claim = {
  row: number;
  /** Column the claim points at: a year, or `years.length` for the average. */
  col: number;
  value: number;
  unit: string;
};

export type Puzzle = {
  table: DataTable;
  claim: Claim;
  /** How the claim relates to the table; `match` means exactly one cell is right. */
  verdict: Verdict;
};

export function columnCount(table: DataTable): number {
  return table.years.length + 1;
}

/** FNV-1a, so the headline and stamp text steer the puzzle without any new content field. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.int(items.length)];
  if (item === undefined) {
    throw new Error('empty pool');
  }
  return item;
}

/** Fisher–Yates on a copy. */
function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function average(values: readonly number[]): number {
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** A row of year values (a gentle random walk) plus their average; all distinct in the table. */
function makeRow(rng: Rng, topic: Topic, used: ReadonlySet<number>): number[] {
  let row: number[] = [];
  const span = topic.max - topic.min;
  for (let attempt = 0; attempt < 300; attempt++) {
    let value = topic.min + rng.int(span + 1);
    const years: number[] = [];
    for (let i = 0; i < DATA_LIBRARY_YEARS; i++) {
      years.push(
        Math.min(topic.max, Math.max(topic.min, Math.round(value / topic.step) * topic.step)),
      );
      // Next year moves by 4–20 % of the span, either direction.
      const delta = Math.round(span * (0.04 + rng.next() * 0.16));
      value = rng.next() < 0.5 ? value - delta : value + delta;
    }
    row = [...years, average(years)];
    if (new Set(row).size === row.length && row.every((v) => !used.has(v))) {
      return row;
    }
  }
  return row;
}

export function generateTable(rng: Rng): DataTable {
  const topic = pick(rng, pl.minigames.dataLibrary.topics);
  const rowLabels = shuffled(rng, topic.rows).slice(0, DATA_LIBRARY_ROWS);
  const firstYear = 2021 + rng.int(3);
  const years = Array.from({ length: DATA_LIBRARY_YEARS }, (_, i) => firstYear + i);
  const used = new Set<number>();
  const values = rowLabels.map(() => {
    const row = makeRow(rng, topic, used);
    for (const v of row) {
      used.add(v);
    }
    return row;
  });
  return { title: topic.title, unit: topic.unit, rowLabels, years, values };
}

function topicOf(table: DataTable): Topic {
  const topic = pl.minigames.dataLibrary.topics.find((t) => t.title === table.title);
  if (!topic) {
    throw new Error(`unknown topic ${table.title}`);
  }
  return topic;
}

export function cellValue(table: DataTable, row: number, col: number): number {
  return table.values[row]?.[col] ?? Number.NaN;
}

/** A figure that is in no cell: the true one scaled, so it still looks plausible. */
function inventedValue(rng: Rng, table: DataTable, truth: number): number {
  const all = new Set(table.values.flat());
  const { step } = topicOf(table);
  const candidates = [
    Math.round((truth * 1.3) / step) * step,
    Math.round((truth * 0.75) / step) * step,
    Math.round((truth * 1.15) / step) * step,
    truth + step * (3 + rng.int(5)),
  ];
  for (const c of shuffled(rng, candidates)) {
    if (c > 0 && !all.has(c)) {
      return c;
    }
  }
  return truth + step * 11 + 1;
}

/** Builds a claim of the wanted kind about cell `row`/`col` of the table. */
export function makeClaim(
  rng: Rng,
  table: DataTable,
  row: number,
  col: number,
  verdict: Verdict,
): Claim {
  const avgCol = table.years.length;
  const truth = cellValue(table, row, col);
  const base: Claim = { row, col, value: truth, unit: table.unit };
  switch (verdict) {
    case 'match':
      return base;
    case 'wrongUnit':
      return { ...base, unit: topicOf(table).altUnit };
    case 'wrongYear': {
      // The figure of another year, said for this one (a year column, never the average).
      const yearCol = col === avgCol ? rng.int(avgCol) : col;
      const other = pick(
        rng,
        table.years.map((_, c) => c).filter((c) => c !== yearCol),
      );
      return { row, col: yearCol, value: cellValue(table, row, other), unit: table.unit };
    }
    case 'wrongRow': {
      const other = pick(
        rng,
        table.rowLabels.map((_, r) => r).filter((r) => r !== row),
      );
      return { ...base, value: cellValue(table, other, col) };
    }
    case 'cherryPick': {
      // An "average" claim that quotes the best year instead.
      const years = table.values[row]?.slice(0, avgCol) ?? [];
      return { row, col: avgCol, value: Math.max(...years), unit: table.unit };
    }
    case 'invented':
      return { ...base, value: inventedValue(rng, table, truth) };
  }
}

/** The kind of manipulation (or `match`) the claim shows, judged only from table and claim. */
export function diagnose(table: DataTable, claim: Claim): Verdict {
  const avgCol = table.years.length;
  const truth = cellValue(table, claim.row, claim.col);
  if (claim.value === truth) {
    return claim.unit === table.unit ? 'match' : 'wrongUnit';
  }
  if (claim.unit !== table.unit) {
    return 'invented';
  }
  const row = table.values[claim.row] ?? [];
  if (claim.col === avgCol && row.slice(0, avgCol).includes(claim.value)) {
    return 'cherryPick';
  }
  if (row.includes(claim.value)) {
    return 'wrongYear';
  }
  if (table.values.some((r, i) => i !== claim.row && r[claim.col] === claim.value)) {
    return 'wrongRow';
  }
  return 'invented';
}

/** The one cell that matches the claim, or null when the claim does not match. */
export function answerCell(puzzle: Puzzle): { row: number; col: number } | null {
  return puzzle.verdict === 'match' ? { row: puzzle.claim.row, col: puzzle.claim.col } : null;
}

/** Same seed, story and stamp → same puzzle. */
export function generatePuzzle(seed: number, story: Story, stamp: Stamp | undefined): Puzzle {
  const rng = createRng(seed ^ 0x5eed_0007 ^ hashText(`${story.headline}|${stamp?.text ?? ''}`));
  const table = generateTable(rng);
  const row = rng.int(table.rowLabels.length);
  const col = rng.int(columnCount(table));
  // A decisive stamp on an untrue story (or a misleading one on a true story) means the figure
  // was altered; without a stamp it is random.
  const altered = stamp
    ? cardHasFlags(story, stamp, rng)
    : rng.next() < DATA_LIBRARY_ALTERED_CHANCE;
  const wanted: Verdict = altered ? pick(rng, MISMATCH_KINDS) : 'match';
  const claim = makeClaim(rng, table, row, col, wanted);
  return { table, claim, verdict: diagnose(table, claim) };
}

// --- Rules -------------------------------------------------------------------------------

export type Outcome = 'playing' | 'success' | 'failure';

/** Cursor position; `row === number of table rows` is the „nie pasuje” button. */
export type Cursor = { row: number; col: number };

export type GameState = {
  puzzle: Puzzle;
  cursor: Cursor;
  /** Wrong cells, crossed out (cannot be picked again). */
  struck: boolean[][];
  mismatchStruck: boolean;
  mistakes: number;
  outcome: Outcome;
  /** What the player chose last: a cell, or the mismatch button. */
  picked: Cursor | null;
};

export type Action =
  | { type: 'move'; dRow: number; dCol: number }
  | { type: 'pick'; row: number; col: number }
  | { type: 'mismatch' }
  | { type: 'confirm' };

/** What just happened, for feedback cues. */
export type Effect = 'move' | 'right' | 'mistake' | 'failed' | 'blocked';

export function initialState(puzzle: Puzzle): GameState {
  return {
    puzzle,
    cursor: { row: 0, col: 0 },
    struck: puzzle.table.values.map((r) => r.map(() => false)),
    mismatchStruck: false,
    mistakes: 0,
    outcome: 'playing',
    picked: null,
  };
}

function wrong(state: GameState, patch: Partial<GameState>): [GameState, Effect] {
  const mistakes = state.mistakes + 1;
  const failed = mistakes >= DATA_LIBRARY_MAX_MISTAKES;
  return [
    { ...state, ...patch, mistakes, outcome: failed ? 'failure' : 'playing' },
    failed ? 'failed' : 'mistake',
  ];
}

function pickCell(state: GameState, row: number, col: number): [GameState, Effect | null] {
  const struck = state.struck[row]?.[col];
  if (struck === undefined) {
    return [state, null];
  }
  const cursor = { row, col };
  if (struck) {
    return [{ ...state, cursor }, 'blocked'];
  }
  const answer = answerCell(state.puzzle);
  if (answer && answer.row === row && answer.col === col) {
    return [{ ...state, cursor, picked: cursor, outcome: 'success' }, 'right'];
  }
  const nextStruck = state.struck.map((r) => [...r]);
  (nextStruck[row] as boolean[])[col] = true;
  return wrong(state, { cursor, struck: nextStruck, picked: cursor });
}

function pickMismatch(state: GameState): [GameState, Effect] {
  const cursor = { row: state.puzzle.table.rowLabels.length, col: state.cursor.col };
  if (state.mismatchStruck) {
    return [{ ...state, cursor }, 'blocked'];
  }
  if (state.puzzle.verdict !== 'match') {
    return [{ ...state, cursor, picked: cursor, outcome: 'success' }, 'right'];
  }
  return wrong(state, { cursor, mismatchStruck: true, picked: cursor });
}

export function reduce(state: GameState, action: Action): [GameState, Effect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  const rows = state.puzzle.table.rowLabels.length;
  const cols = columnCount(state.puzzle.table);
  switch (action.type) {
    case 'move': {
      const { row, col } = state.cursor;
      const nextRow = Math.max(0, Math.min(rows, row + action.dRow));
      const nextCol = row < rows ? (col + action.dCol + cols) % cols : col;
      if (nextRow === row && nextCol === col) {
        return [state, null];
      }
      return [{ ...state, cursor: { row: nextRow, col: nextCol } }, 'move'];
    }
    case 'pick':
      return pickCell(state, action.row, action.col);
    case 'mismatch':
      return pickMismatch(state);
    case 'confirm':
      return state.cursor.row === rows
        ? pickMismatch(state)
        : pickCell(state, state.cursor.row, state.cursor.col);
  }
}
