import { describe, expect, test } from 'bun:test';
import { evidenceShortfall, toggleEvidence, verdictReady } from './desk-model.ts';

describe('toggleEvidence', () => {
  test('one proof: a pick replaces the previous one and never empties it', () => {
    expect(toggleEvidence([], 'a', 1)).toEqual({ selected: ['a'], blocked: false, removed: false });
    expect(toggleEvidence(['a'], 'b', 1)).toEqual({
      selected: ['b'],
      blocked: false,
      removed: false,
    });
    expect(toggleEvidence(['a'], 'a', 1)).toEqual({
      selected: ['a'],
      blocked: false,
      removed: false,
    });
  });

  test('several proofs: picks toggle in the order chosen', () => {
    expect(toggleEvidence([], 'b', 2).selected).toEqual(['b']);
    expect(toggleEvidence(['b'], 'a', 2).selected).toEqual(['b', 'a']);
    expect(toggleEvidence(['b', 'a'], 'b', 2)).toEqual({
      selected: ['a'],
      blocked: false,
      removed: true,
    });
  });

  test('adding beyond N is blocked and keeps the pick', () => {
    expect(toggleEvidence(['a', 'b'], 'c', 2)).toEqual({
      selected: ['a', 'b'],
      blocked: true,
      removed: false,
    });
    expect(toggleEvidence(['a', 'b', 'c'], 'd', 3).blocked).toBe(true);
    // Taking one out first frees the slot.
    expect(toggleEvidence(['a', 'b'], 'a', 2).selected).toEqual(['b']);
    expect(toggleEvidence(['b'], 'c', 2).selected).toEqual(['b', 'c']);
  });
});

describe('verdictReady', () => {
  test('ready when the pick holds min(N, collected) stamps', () => {
    expect(verdictReady(['a'], 2, 1)).toBe(true);
    expect(verdictReady(['a'], 2, 2)).toBe(false);
    expect(verdictReady(['a', 'b'], 2, 2)).toBe(true);
    expect(verdictReady(['a', 'b'], 2, 3)).toBe(true);
    expect(verdictReady(['a'], 1, 3)).toBe(true);
    expect(verdictReady(['a', 'b'], 3, 2)).toBe(true);
  });

  test('never ready with nothing picked', () => {
    expect(verdictReady([], 1, 2)).toBe(false);
    expect(verdictReady([], 2, 0)).toBe(false);
  });
});

describe('evidenceShortfall', () => {
  test('fewer collected stamps than required proofs', () => {
    expect(evidenceShortfall(2, 1)).toBe(true);
    expect(evidenceShortfall(3, 2)).toBe(true);
    expect(evidenceShortfall(2, 2)).toBe(false);
    expect(evidenceShortfall(1, 1)).toBe(false);
  });
});
