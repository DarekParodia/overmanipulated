import { describe, expect, it } from 'bun:test';
import { createRng } from '@redakcja/shared';
import { hashText, pick, problemFromStamp, shuffled } from './evidence.ts';

describe('problemFromStamp', () => {
  it('follows the stamp: decisive proves the story, misleading points the wrong way', () => {
    expect(problemFromStamp({ truth: 'false' }, { relevance: 'decisive' })).toBe(true);
    expect(problemFromStamp({ truth: 'true' }, { relevance: 'decisive' })).toBe(false);
    expect(problemFromStamp({ truth: 'true' }, { relevance: 'misleading' })).toBe(true);
    expect(problemFromStamp({ truth: 'false' }, { relevance: 'misleading' })).toBe(false);
    expect(problemFromStamp({ truth: 'true' }, { relevance: 'irrelevant' })).toBe(false);
    expect(problemFromStamp({ truth: 'false' }, { relevance: 'irrelevant' })).toBe(false);
    expect(problemFromStamp({ truth: 'false' }, undefined)).toBeNull();
  });

  it('treats every untrue truth value like false', () => {
    for (const truth of ['false', 'misleading', 'satire', 'unverifiable'] as const) {
      expect(problemFromStamp({ truth }, { relevance: 'decisive' }), truth).toBe(true);
    }
  });
});

describe('hashText', () => {
  it('is the 32-bit FNV-1a hash as a signed integer', () => {
    expect(hashText('')).toBe(-2128831035);
    expect(hashText('a')).toBe(-468965076);
  });
});

describe('shuffled and pick', () => {
  it('shuffles a copy without losing items and leaves the input alone', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = shuffled(createRng(7), items);
    expect(out).toHaveLength(6);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is deterministic for a seed', () => {
    expect(shuffled(createRng(42), ['a', 'b', 'c', 'd'])).toEqual(
      shuffled(createRng(42), ['a', 'b', 'c', 'd']),
    );
    expect(pick(createRng(42), ['a', 'b', 'c', 'd'])).toBe(
      pick(createRng(42), ['a', 'b', 'c', 'd']),
    );
  });

  it('picks from the pool and refuses an empty one', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(['x', 'y', 'z']).toContain(pick(createRng(seed), ['x', 'y', 'z']));
    }
    expect(() => pick(createRng(1), [])).toThrow('empty pool');
  });
});
