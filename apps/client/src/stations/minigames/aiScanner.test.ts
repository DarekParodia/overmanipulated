import { describe, expect, it } from 'bun:test';
import { STORIES, type Story } from '@redakcja/content';
import {
  AI_SCANNER_MARGIN_MAX,
  AI_SCANNER_MARGIN_MIN,
  AI_SCANNER_READING_MAX,
  AI_SCANNER_READING_MIN,
} from '@redakcja/shared';
import {
  ANSWERS,
  classify,
  correctAnswer,
  generateReading,
  initialState,
  isAmbiguous,
  isCorrect,
  readingRange,
  reduce,
  type ScannerReading,
} from './aiScanner.logic.ts';

const base = STORIES[0] as Story;
const story = (patch: Partial<Story>): Story => ({ ...base, ...patch });

describe('generateReading', () => {
  it('is deterministic for the same seed and story', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(generateReading(seed, base)).toEqual(generateReading(seed, base));
    }
  });

  it('keeps percent and margin in range', () => {
    for (const s of STORIES) {
      for (let seed = 1; seed <= 60; seed++) {
        const r = generateReading(seed, s);
        expect(r.percent).toBeGreaterThanOrEqual(AI_SCANNER_READING_MIN);
        expect(r.percent).toBeLessThanOrEqual(AI_SCANNER_READING_MAX);
        expect(r.margin).toBeGreaterThanOrEqual(AI_SCANNER_MARGIN_MIN);
        expect(r.margin).toBeLessThanOrEqual(AI_SCANNER_MARGIN_MAX);
      }
    }
  });

  it('leans towards AI for false stories and towards real for true ones', () => {
    const avg = (truth: Story['truth']) => {
      let sum = 0;
      for (let seed = 1; seed <= 200; seed++) {
        sum += generateReading(seed, story({ truth, type: 'photo' })).percent;
      }
      return sum / 200;
    };
    expect(avg('false')).toBeGreaterThan(avg('true') + 30);
  });

  it('produces both ambiguous and clear readings', () => {
    for (const truth of ['true', 'false', 'misleading'] as const) {
      const kinds = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        kinds.add(classify(generateReading(seed, story({ truth }))));
      }
      expect(kinds.has('ambiguous')).toBe(true);
      expect(kinds.size).toBeGreaterThan(1);
    }
  });
});

describe('answer rules', () => {
  const r = (percent: number, margin: number): ScannerReading => ({ percent, margin });

  it('a range that covers 50 % is ambiguous and „Nie wiem” is correct', () => {
    expect(isAmbiguous(r(55, 10))).toBe(true);
    expect(isAmbiguous(r(40, 10))).toBe(true); // touches 50 exactly
    expect(correctAnswer(r(50, 6))).toBe('unsure');
    expect(isCorrect(r(60, 20), 'unsure')).toBe(true);
    expect(isCorrect(r(60, 20), 'ai')).toBe(false);
    expect(isCorrect(r(60, 20), 'real')).toBe(false);
  });

  it('a clear range wants its side and punishes „Nie wiem”', () => {
    expect(correctAnswer(r(85, 15))).toBe('ai');
    expect(correctAnswer(r(15, 20))).toBe('real');
    expect(isCorrect(r(85, 15), 'unsure')).toBe(false);
    expect(isCorrect(r(85, 15), 'real')).toBe(false);
    expect(classify(r(85, 15))).toBe('clearAi');
    expect(classify(r(15, 20))).toBe('clearReal');
  });

  it('clips the shaded range to the gauge', () => {
    expect(readingRange(r(95, 20))).toEqual({ low: 75, high: 100 });
    expect(readingRange(r(5, 20))).toEqual({ low: 0, high: 25 });
  });
});

describe('reduce', () => {
  const clear = initialState({ percent: 85, margin: 10 });

  it('starts on „Nie wiem” and moves within bounds', () => {
    expect(ANSWERS[clear.cursor]).toBe('unsure');
    const [right, e1] = reduce(clear, { type: 'move', delta: 1 });
    expect(ANSWERS[right.cursor]).toBe('ai');
    expect(e1).toBe('move');
    const [same, e2] = reduce(right, { type: 'move', delta: 1 });
    expect(same).toBe(right);
    expect(e2).toBeNull();
  });

  it('confirm answers with the cursor and finishes once', () => {
    const [moved] = reduce(clear, { type: 'move', delta: 1 });
    const [done, effect] = reduce(moved, { type: 'confirm' });
    expect(done.outcome).toBe('success');
    expect(effect).toBe('success');
    const [again, none] = reduce(done, { type: 'pick', answer: 'real' });
    expect(again).toBe(done);
    expect(none).toBeNull();
  });

  it('a wrong pick fails', () => {
    const [done, effect] = reduce(clear, { type: 'pick', answer: 'unsure' });
    expect(done.outcome).toBe('failure');
    expect(effect).toBe('failure');
    expect(done.answer).toBe('unsure');
  });
});
