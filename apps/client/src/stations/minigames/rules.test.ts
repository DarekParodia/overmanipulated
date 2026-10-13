import { describe, expect, test } from 'bun:test';
import { effectiveHints } from '../../guidance/store.ts';
import { revealsOnFail, roundRules } from './rules.ts';

describe('minigame round rules per difficulty (S7-24)', () => {
  test('time limit: 30 s Łatwy, 20 s Normalny, 17 s Trudny, 15 s Ekspert', () => {
    expect(roundRules('archive', 'easy').timeLimitMs).toBe(30_000);
    expect(roundRules('archive', 'normal').timeLimitMs).toBe(20_000);
    expect(roundRules('archive', 'hard').timeLimitMs).toBe(17_000);
    expect(roundRules('archive', 'expert').timeLimitMs).toBe(15_000);
  });

  test('a failure shows the answer except on Ekspert', () => {
    expect(revealsOnFail('dataLibrary', 'easy')).toBe(true);
    expect(revealsOnFail('dataLibrary', 'normal')).toBe(true);
    expect(revealsOnFail('imageSearch', 'hard')).toBe(true);
    expect(revealsOnFail('aiScanner', 'expert')).toBe(false);
    expect(revealsOnFail('archive', 'expert')).toBe(false);
  });

  test('the Kartoteka keeps its card, so it never shows the answer', () => {
    expect(revealsOnFail('sourceRegistry', 'easy')).toBe(false);
    expect(revealsOnFail('sourceRegistry', 'normal')).toBe(false);
  });

  test('carries the difficulty for the mistake limits', () => {
    expect(roundRules('phone', 'hard')).toEqual({
      difficulty: 'hard',
      timeLimitMs: 17_000,
      revealOnFail: true,
    });
  });
});

describe('effective hints (S7-24)', () => {
  test('the setting AND the difficulty: Ekspert has none', () => {
    expect(effectiveHints(true, 'easy')).toBe(true);
    expect(effectiveHints(true, 'normal')).toBe(true);
    expect(effectiveHints(true, 'hard')).toBe(true);
    expect(effectiveHints(true, 'expert')).toBe(false);
    expect(effectiveHints(false, 'normal')).toBe(false);
  });
});
