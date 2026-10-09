// AI scanner minigame („Skaner AI”, S4-02): pure reading generation and answer rules.
// The scanner shows how likely the material is machine made, always with an error margin. The
// reading is noisy and never decisive alone: when the margin range still contains the 50 % line
// the honest answer is „Nie wiem”; otherwise the player picks the side the whole range is on.
// Real-world analogue: AI-content detectors are unreliable, a score is a hint, not a verdict.
import type { Story } from '@redakcja/content';
import {
  AI_SCANNER_BASE_BY_TRUTH,
  AI_SCANNER_MARGIN_MAX,
  AI_SCANNER_MARGIN_MIN,
  AI_SCANNER_MEDIA_SHIFT,
  AI_SCANNER_NOISE,
  AI_SCANNER_READING_MAX,
  AI_SCANNER_READING_MIN,
  AI_SCANNER_THRESHOLD,
  createRng,
  type StoryType,
} from '@redakcja/shared';

export type ScannerAnswer = 'real' | 'unsure' | 'ai';

/** Answer buttons in gauge order: left = low percentage. */
export const ANSWERS: readonly ScannerAnswer[] = ['real', 'unsure', 'ai'];

export type ScannerReading = {
  /** Centre of the reading, whole percent 0..100 ("78 % ± 15 %" → 78). */
  percent: number;
  /** Error margin, whole percent. */
  margin: number;
};

/** How the reading reads; picks the explanation line. */
export type ScannerVerdict = 'ambiguous' | 'clearAi' | 'clearReal';

type StoryLike = Pick<Story, 'truth' | 'type'>;

const MEDIA_TYPES: readonly StoryType[] = ['photo', 'recording'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where the reading starts before noise: from the story's truth, pushed by its kind. */
export function baseReading(story: StoryLike): number {
  const base = AI_SCANNER_BASE_BY_TRUTH[story.truth];
  if (story.truth !== 'false' && story.truth !== 'misleading') {
    return base;
  }
  // Manipulated material: media shows more traces than text and figures.
  const shift = MEDIA_TYPES.includes(story.type) ? AI_SCANNER_MEDIA_SHIFT : -AI_SCANNER_MEDIA_SHIFT;
  return base + shift;
}

/** Same story + seed → same reading. */
export function generateReading(seed: number, story: StoryLike): ScannerReading {
  const rng = createRng(seed);
  const noise = (rng.next() * 2 - 1) * AI_SCANNER_NOISE;
  const margin = AI_SCANNER_MARGIN_MIN + rng.int(AI_SCANNER_MARGIN_MAX - AI_SCANNER_MARGIN_MIN + 1);
  return {
    percent: Math.round(
      clamp(baseReading(story) + noise, AI_SCANNER_READING_MIN, AI_SCANNER_READING_MAX),
    ),
    margin,
  };
}

/** Lower and upper end of the shaded range, clipped to the gauge. */
export function readingRange(reading: ScannerReading): { low: number; high: number } {
  return {
    low: Math.max(0, reading.percent - reading.margin),
    high: Math.min(100, reading.percent + reading.margin),
  };
}

/** Ambiguous when the margin range reaches the threshold (inclusive). */
export function isAmbiguous(reading: ScannerReading): boolean {
  const { low, high } = readingRange(reading);
  return low <= AI_SCANNER_THRESHOLD && high >= AI_SCANNER_THRESHOLD;
}

export function classify(reading: ScannerReading): ScannerVerdict {
  if (isAmbiguous(reading)) {
    return 'ambiguous';
  }
  return reading.percent > AI_SCANNER_THRESHOLD ? 'clearAi' : 'clearReal';
}

export function correctAnswer(reading: ScannerReading): ScannerAnswer {
  const verdict = classify(reading);
  if (verdict === 'ambiguous') return 'unsure';
  return verdict === 'clearAi' ? 'ai' : 'real';
}

export function isCorrect(reading: ScannerReading, answer: ScannerAnswer): boolean {
  return correctAnswer(reading) === answer;
}

// --- Screen state --------------------------------------------------------------------------

export type ScannerState = {
  reading: ScannerReading;
  /** Index into ANSWERS under the keyboard/gamepad cursor; starts on „Nie wiem”. */
  cursor: number;
  answer: ScannerAnswer | null;
  outcome: 'playing' | 'success' | 'failure';
};

export type ScannerAction =
  | { type: 'move'; delta: number }
  | { type: 'pick'; answer: ScannerAnswer }
  | { type: 'confirm' };
export type ScannerEffect = 'move' | 'success' | 'failure';

export function initialState(reading: ScannerReading): ScannerState {
  return { reading, cursor: 1, answer: null, outcome: 'playing' };
}

export function reduce(
  state: ScannerState,
  action: ScannerAction,
): [ScannerState, ScannerEffect | null] {
  if (state.outcome !== 'playing') {
    return [state, null];
  }
  switch (action.type) {
    case 'move': {
      const cursor = clamp(state.cursor + action.delta, 0, ANSWERS.length - 1);
      return cursor === state.cursor ? [state, null] : [{ ...state, cursor }, 'move'];
    }
    case 'confirm':
      return reduce(state, { type: 'pick', answer: ANSWERS[state.cursor] ?? 'unsure' });
    case 'pick': {
      const success = isCorrect(state.reading, action.answer);
      const cursor = ANSWERS.indexOf(action.answer);
      return [
        { ...state, cursor, answer: action.answer, outcome: success ? 'success' : 'failure' },
        success ? 'success' : 'failure',
      ];
    }
  }
}
