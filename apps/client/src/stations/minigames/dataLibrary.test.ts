import { describe, expect, it } from 'bun:test';
import { STORIES, type Stamp, type Story } from '@redakcja/content';
import {
  createRng,
  DATA_LIBRARY_MAX_MISTAKES,
  DATA_LIBRARY_ROWS,
  DATA_LIBRARY_YEARS,
} from '@redakcja/shared';
import {
  type Action,
  answerCell,
  columnCount,
  diagnose,
  generatePuzzle,
  generateTable,
  initialState,
  MISMATCH_KINDS,
  makeClaim,
  type Puzzle,
  reduce,
} from './dataLibrary.logic.ts';

const base = STORIES[0] as Story;
const story = (patch: Partial<Story>): Story => ({ ...base, ...patch });
const stamp = (relevance: Stamp['relevance']): Stamp => ({
  id: 'test-data',
  station: 'dataLibrary',
  text: 'Test',
  relevance,
});

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function puzzleWith(verdict: Puzzle['verdict']): Puzzle {
  for (const seed of SEEDS) {
    const puzzle = generatePuzzle(seed, base, undefined);
    if (puzzle.verdict === verdict) {
      return puzzle;
    }
  }
  throw new Error(`no ${verdict} puzzle`);
}

function run(puzzle: Puzzle, actions: Action[]) {
  let state = initialState(puzzle);
  for (const action of actions) {
    state = reduce(state, action)[0];
  }
  return state;
}

describe('generatePuzzle', () => {
  it('is deterministic for the same seed, story and stamp', () => {
    expect(generatePuzzle(7, base, undefined)).toEqual(generatePuzzle(7, base, undefined));
    expect(generatePuzzle(7, base, stamp('decisive'))).toEqual(
      generatePuzzle(7, base, stamp('decisive')),
    );
  });

  it('varies with the seed and with the story headline', () => {
    const seeds = new Set(SEEDS.map((s) => JSON.stringify(generatePuzzle(s, base, undefined))));
    expect(seeds.size).toBeGreaterThan(150);
    const other = story({ headline: 'Zupełnie inny nagłówek' });
    expect(generatePuzzle(3, other, undefined)).not.toEqual(generatePuzzle(3, base, undefined));
  });

  it('builds a table of the configured size with all values distinct', () => {
    for (const seed of SEEDS) {
      const { table } = generatePuzzle(seed, base, undefined);
      expect(table.rowLabels).toHaveLength(DATA_LIBRARY_ROWS);
      expect(table.years).toHaveLength(DATA_LIBRARY_YEARS);
      expect(table.values.every((r) => r.length === columnCount(table))).toBe(true);
      const all = table.values.flat();
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('keeps the average column equal to the rounded mean of the years', () => {
    for (const seed of SEEDS) {
      const { table } = generatePuzzle(seed, base, undefined);
      for (const row of table.values) {
        const years = row.slice(0, DATA_LIBRARY_YEARS);
        expect(row[DATA_LIBRARY_YEARS]).toBe(
          Math.round(years.reduce((a, b) => a + b, 0) / years.length),
        );
      }
    }
  });

  it('follows the stamp: decisive on a false story alters, on a true story matches', () => {
    const verdicts = (s: Story, st: Stamp) =>
      SEEDS.map((seed) => generatePuzzle(seed, s, st).verdict);
    expect(verdicts(story({ truth: 'false' }), stamp('decisive')).every((v) => v !== 'match')).toBe(
      true,
    );
    expect(verdicts(story({ truth: 'true' }), stamp('decisive')).every((v) => v === 'match')).toBe(
      true,
    );
    expect(
      verdicts(story({ truth: 'true' }), stamp('misleading')).every((v) => v !== 'match'),
    ).toBe(true);
  });

  it('covers every mismatch kind and plain matches across seeds', () => {
    const seen = new Set(SEEDS.map((s) => generatePuzzle(s, base, undefined).verdict));
    expect(seen.has('match')).toBe(true);
    for (const kind of MISMATCH_KINDS) {
      expect(seen.has(kind)).toBe(true);
    }
  });
});

describe('mismatch kinds are detectable', () => {
  it('makeClaim produces a claim that diagnose classifies as the wanted kind', () => {
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      const table = generateTable(rng);
      for (const kind of ['match', ...MISMATCH_KINDS] as const) {
        for (let row = 0; row < table.rowLabels.length; row++) {
          for (let col = 0; col < columnCount(table); col++) {
            const claim = makeClaim(rng, table, row, col, kind);
            const found = diagnose(table, claim);
            if (kind === 'wrongYear' && col === table.years.length) {
              // An average column cannot be a "wrong year"; it becomes a year column claim.
              expect(found).toBe('wrongYear');
            } else {
              expect(found).toBe(kind);
            }
          }
        }
      }
    }
  });

  it('a wrong-unit claim has the table digits but another unit', () => {
    const puzzle = puzzleWith('wrongUnit');
    const { table, claim } = puzzle;
    expect(claim.value).toBe(table.values[claim.row]?.[claim.col] as number);
    expect(claim.unit).not.toBe(table.unit);
  });

  it('a cherry-picked claim quotes the best year as the average', () => {
    const { table, claim } = puzzleWith('cherryPick');
    expect(claim.col).toBe(table.years.length);
    const years = (table.values[claim.row] as number[]).slice(0, table.years.length);
    expect(claim.value).toBe(Math.max(...years));
    expect(claim.value).not.toBe(table.values[claim.row]?.[claim.col] as number);
  });

  it('an invented figure is in no cell', () => {
    const { table, claim } = puzzleWith('invented');
    expect(table.values.flat()).not.toContain(claim.value);
  });

  it('only a match has an answer cell, and exactly one cell fits', () => {
    for (const seed of SEEDS) {
      const puzzle = generatePuzzle(seed, base, undefined);
      const answer = answerCell(puzzle);
      const fitting = puzzle.table.values.flatMap((r, row) =>
        r.flatMap((v, col) =>
          v === puzzle.claim.value && puzzle.claim.unit === puzzle.table.unit ? [{ row, col }] : [],
        ),
      );
      if (puzzle.verdict === 'match') {
        expect(answer).toEqual({ row: puzzle.claim.row, col: puzzle.claim.col });
        expect(fitting).toEqual([answer as { row: number; col: number }]);
      } else {
        expect(answer).toBeNull();
      }
    }
  });
});

describe('reduce', () => {
  it('picking the matching cell wins', () => {
    const puzzle = puzzleWith('match');
    const { row, col } = puzzle.claim;
    const [state, effect] = reduce(initialState(puzzle), { type: 'pick', row, col });
    expect(state.outcome).toBe('success');
    expect(effect).toBe('right');
  });

  it('reporting a mismatch on an altered claim wins', () => {
    for (const kind of MISMATCH_KINDS) {
      const state = run(puzzleWith(kind), [{ type: 'mismatch' }]);
      expect(state.outcome).toBe('success');
    }
  });

  it('reporting a mismatch on a true claim is a mistake', () => {
    const [state, effect] = reduce(initialState(puzzleWith('match')), { type: 'mismatch' });
    expect(state.outcome).toBe('playing');
    expect(state.mistakes).toBe(1);
    expect(state.mismatchStruck).toBe(true);
    expect(effect).toBe('mistake');
  });

  it('a wrong cell is struck out and a second tap on it is free', () => {
    const puzzle = puzzleWith('invented');
    const first = reduce(initialState(puzzle), { type: 'pick', row: 0, col: 0 });
    expect(first[1]).toBe('mistake');
    expect(first[0].struck[0]?.[0]).toBe(true);
    const second = reduce(first[0], { type: 'pick', row: 0, col: 0 });
    expect(second[1]).toBe('blocked');
    expect(second[0].mistakes).toBe(1);
  });

  it('fails after the maximum number of mistakes', () => {
    const puzzle = puzzleWith('invented');
    const picks: Action[] = [];
    for (let col = 0; col < DATA_LIBRARY_MAX_MISTAKES; col++) {
      picks.push({ type: 'pick', row: 0, col });
    }
    const state = run(puzzle, picks);
    expect(state.outcome).toBe('failure');
    expect(reduce(state, { type: 'mismatch' })[1]).toBeNull();
  });

  it('moves the cursor over the grid and onto the mismatch button', () => {
    const puzzle = puzzleWith('match');
    const rows = puzzle.table.rowLabels.length;
    let state = initialState(puzzle);
    state = reduce(state, { type: 'move', dRow: 0, dCol: -1 })[0];
    expect(state.cursor).toEqual({ row: 0, col: columnCount(puzzle.table) - 1 });
    for (let i = 0; i < rows + 2; i++) {
      state = reduce(state, { type: 'move', dRow: 1, dCol: 0 })[0];
    }
    expect(state.cursor.row).toBe(rows);
    // Confirm on the button reports a mismatch.
    expect(reduce(state, { type: 'confirm' })[0].mismatchStruck).toBe(true);
    // Sideways on the button does nothing; up returns to the grid in the same column.
    expect(reduce(state, { type: 'move', dRow: 0, dCol: 1 })[1]).toBeNull();
    expect(reduce(state, { type: 'move', dRow: -1, dCol: 0 })[0].cursor.row).toBe(rows - 1);
  });
});
