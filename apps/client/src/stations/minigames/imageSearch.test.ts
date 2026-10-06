import { describe, expect, it } from 'bun:test';
import {
  createPuzzle,
  initialPlay,
  missingFragments,
  moveCursor,
  nextFragment,
  pick,
  resultShows,
  yearFromText,
} from './imageSearch.logic.ts';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

describe('image search puzzle', () => {
  it('builds the same puzzle from the same seed', () => {
    expect(createPuzzle(42)).toEqual(createPuzzle(42));
    expect(createPuzzle(42)).not.toEqual(createPuzzle(43));
  });

  it('marks 2–3 fragments and lays out 4–6 results', () => {
    for (const seed of SEEDS) {
      const puzzle = createPuzzle(seed);
      expect(puzzle.fragments.length).toBeGreaterThanOrEqual(2);
      expect(puzzle.fragments.length).toBeLessThanOrEqual(3);
      expect(new Set(puzzle.fragments).size).toBe(puzzle.fragments.length);
      expect(puzzle.results.length).toBeGreaterThanOrEqual(4);
      expect(puzzle.results.length).toBeLessThanOrEqual(6);
    }
  });

  it('has exactly one result that shows every marked fragment', () => {
    for (const seed of SEEDS) {
      const puzzle = createPuzzle(seed);
      const complete = puzzle.results
        .map((_, i) => i)
        .filter((i) => missingFragments(puzzle, i).length === 0);
      expect(complete).toEqual([puzzle.answer]);
    }
  });

  it('gives every distractor a different site than the match', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const puzzle = createPuzzle(seed);
      const sites = puzzle.results.map((r) => r.site);
      expect(new Set(sites).size).toBe(sites.length);
    }
  });

  it('keeps every fragment needed: each one is altered in some near-copy distractor', () => {
    for (const seed of SEEDS) {
      const puzzle = createPuzzle(seed);
      const nearCopies = puzzle.results
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.distractor !== null && r.distractor !== 'otherScene');
      if (nearCopies.length < puzzle.fragments.length) continue;
      const missing = new Set(nearCopies.flatMap(({ i }) => missingFragments(puzzle, i)));
      expect(missing.size).toBe(puzzle.fragments.length);
    }
  });

  it('recolours a fragment into a clearly different tone family', () => {
    const families = [new Set(['ink', 'inkSoft']), new Set(['cork', 'wood'])];
    for (const seed of SEEDS) {
      const puzzle = createPuzzle(seed);
      for (const result of puzzle.results) {
        if (result.distractor !== 'recolour') continue;
        result.scene.shapes.forEach((shape, i) => {
          const original = puzzle.photo.shapes[i];
          if (!original || original.tone === shape.tone) return;
          for (const family of families) {
            expect(family.has(original.tone) && family.has(shape.tone)).toBe(false);
          }
        });
      }
    }
  });

  it('dates the match with the year from the stamp text', () => {
    expect(yearFromText('To samo zdjęcie opublikowano w sieci w 2019 r.')).toBe(2019);
    expect(yearFromText('Nie znaleziono wcześniejszych kopii.')).toBeNull();
    const puzzle = createPuzzle(5, 2017);
    expect(puzzle.results[puzzle.answer]?.date.year).toBe(2017);
  });

  it('shows the match fully in frame', () => {
    for (const seed of SEEDS) {
      const puzzle = createPuzzle(seed);
      const match = puzzle.results[puzzle.answer];
      for (const index of puzzle.fragments) {
        const shape = puzzle.photo.shapes[index];
        if (!match || !shape) throw new Error('missing data');
        expect(resultShows(match, shape)).toBe(true);
      }
    }
  });
});

describe('image search play', () => {
  const puzzle = createPuzzle(7);
  const wrong = puzzle.results.map((_, i) => i).filter((i) => i !== puzzle.answer);
  const [firstWrong = -1, secondWrong = -1] = wrong;

  it('solves on the matching result', () => {
    const { state, outcome } = pick(initialPlay(), puzzle, puzzle.answer);
    expect(outcome).toBe('match');
    expect(state.solved).toBe(true);
  });

  it('fails on the second wrong pick', () => {
    const first = pick(initialPlay(), puzzle, firstWrong);
    expect(first.outcome).toBe('miss');
    expect(first.state.mistakes).toBe(1);
    const again = pick(first.state, puzzle, firstWrong);
    expect(again.outcome).toBe('ignored');
    const second = pick(first.state, puzzle, secondWrong);
    expect(second.outcome).toBe('fail');
    expect(second.state.failed).toBe(true);
    expect(pick(second.state, puzzle, puzzle.answer).outcome).toBe('ignored');
  });

  it('cycles through the fragments', () => {
    let state = initialPlay();
    for (let i = 0; i < puzzle.fragments.length; i++) state = nextFragment(state, puzzle);
    expect(state.fragment).toBe(0);
  });

  it('moves the focus inside the result grid', () => {
    // 6 results → 3 columns, 2 rows.
    expect(moveCursor(0, 'right', 6)).toBe(1);
    expect(moveCursor(2, 'right', 6)).toBe(2);
    expect(moveCursor(1, 'down', 6)).toBe(4);
    expect(moveCursor(4, 'down', 6)).toBe(4);
    expect(moveCursor(3, 'left', 6)).toBe(3);
    // 5 results: no cell under index 2.
    expect(moveCursor(2, 'down', 5)).toBe(2);
    // 4 results → one row.
    expect(moveCursor(1, 'down', 4)).toBe(1);
    expect(moveCursor(2, 'right', 4)).toBe(3);
  });
});
