import { describe, expect, it } from 'bun:test';
import {
  ARCHIVE_MAX_MISTAKES,
  CONTENT_THREE_STARS_SHARE,
  CONTENT_TWO_STARS_SHARE,
  DATA_LIBRARY_MAX_MISTAKES,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  ENDLESS_MIN_DECK,
  IMAGE_SEARCH_MAX_MISTAKES,
  MAX_REQUIRED_STAMPS,
  MINIGAME_FAIL_LOCKOUT_MS,
  MINIGAME_MIN_MISTAKES,
  MINIGAME_TIME_LIMIT_MS,
  MULTI_STAMP_EXTRA_DEADLINE_MS,
  SCORE,
  SOURCE_REGISTRY_MAX_MISTAKES,
  STAR_SHARES,
} from './constants.ts';
import {
  failLockoutMs,
  minigameTimeLimitMs,
  mistakeLimit,
  NORMAL_TUNING,
  simTuning,
} from './difficulty.ts';
import { DIFFICULTIES, difficultySchema } from './domain.ts';

describe('difficulty vocabulary', () => {
  it('lists the four difficulties easiest first', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard', 'expert']);
  });

  it('rejects an unknown difficulty', () => {
    expect(difficultySchema.safeParse('insane').success).toBe(false);
    expect(difficultySchema.safeParse('hard').success).toBe(true);
  });

  it('starts rooms on normal', () => {
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });
});

describe('minigameTimeLimitMs', () => {
  it('scales the 20 s limit per difficulty', () => {
    expect(minigameTimeLimitMs('easy')).toBe(30000);
    expect(minigameTimeLimitMs('normal')).toBe(20000);
    expect(minigameTimeLimitMs('hard')).toBe(17000);
    expect(minigameTimeLimitMs('expert')).toBe(15000);
  });

  it('is the authored limit on normal', () => {
    expect(minigameTimeLimitMs('normal')).toBe(MINIGAME_TIME_LIMIT_MS);
  });
});

describe('mistakeLimit', () => {
  it('adds or removes a mistake on minigames that allow two', () => {
    expect(mistakeLimit(2, 'easy')).toBe(3);
    expect(mistakeLimit(2, 'normal')).toBe(2);
    expect(mistakeLimit(2, 'hard')).toBe(2);
    expect(mistakeLimit(2, 'expert')).toBe(1);
  });

  it('keeps one-mistake minigames (phone, AI scanner) at one on every difficulty', () => {
    expect(mistakeLimit(1, 'easy')).toBe(1);
    expect(mistakeLimit(1, 'normal')).toBe(1);
    expect(mistakeLimit(1, 'expert')).toBe(1);
  });

  it('keeps every real minigame limit at its base on normal, above the floor, never looser when harder', () => {
    const bases = [
      SOURCE_REGISTRY_MAX_MISTAKES,
      ARCHIVE_MAX_MISTAKES,
      IMAGE_SEARCH_MAX_MISTAKES,
      DATA_LIBRARY_MAX_MISTAKES,
    ];
    for (const base of bases) {
      expect(mistakeLimit(base, 'normal')).toBe(base);
      const limits = DIFFICULTIES.map((difficulty) => mistakeLimit(base, difficulty));
      for (const limit of limits) expect(limit).toBeGreaterThanOrEqual(MINIGAME_MIN_MISTAKES);
      expect(limits).toEqual([...limits].sort((a, b) => b - a));
    }
  });
});

describe('failLockoutMs', () => {
  it('scales the 3 s lockout per difficulty', () => {
    expect(failLockoutMs('easy')).toBe(1500);
    expect(failLockoutMs('normal')).toBe(3000);
    expect(failLockoutMs('hard')).toBe(4500);
    expect(failLockoutMs('expert')).toBe(6000);
  });

  it('is the authored lockout on normal', () => {
    expect(failLockoutMs('normal')).toBe(MINIGAME_FAIL_LOCKOUT_MS);
  });
});

describe('simTuning', () => {
  it('leaves authored values unchanged on normal', () => {
    expect(NORMAL_TUNING).toEqual({ workTimeFactor: 1, lockoutFactor: 1, penaltyFactor: 1 });
    expect(simTuning('normal')).toEqual(NORMAL_TUNING);
  });

  it('carries only the factors the simulation applies', () => {
    expect(simTuning('easy')).toEqual({
      workTimeFactor: 0.8,
      lockoutFactor: 0.5,
      penaltyFactor: 0.5,
    });
    expect(simTuning('expert')).toEqual({
      workTimeFactor: 1.25,
      lockoutFactor: 2,
      penaltyFactor: 1.5,
    });
  });

  it('cannot be changed through the shared normal tuning', () => {
    expect(Object.isFrozen(NORMAL_TUNING)).toBe(true);
  });
});

describe('difficulty presets', () => {
  it('get harder in every factor from easy to expert', () => {
    const steps = [
      ['easy', 'normal'],
      ['normal', 'hard'],
      ['hard', 'expert'],
    ] as const;
    for (const [easierId, harderId] of steps) {
      const easier = DIFFICULTY[easierId];
      const harder = DIFFICULTY[harderId];
      expect(harder.deadlineFactor).toBeLessThan(easier.deadlineFactor);
      expect(harder.spawnGapFactor).toBeLessThan(easier.spawnGapFactor);
      expect(harder.minigameTimeFactor).toBeLessThan(easier.minigameTimeFactor);
      expect(harder.workTimeFactor).toBeGreaterThan(easier.workTimeFactor);
      expect(harder.lockoutFactor).toBeGreaterThan(easier.lockoutFactor);
      expect(harder.penaltyFactor).toBeGreaterThan(easier.penaltyFactor);
      expect(harder.extraMistakes).toBeLessThanOrEqual(easier.extraMistakes);
    }
  });

  it('turns off hints and the answer reveal only on expert', () => {
    expect(DIFFICULTIES.filter((d) => !DIFFICULTY[d].hints)).toEqual(['expert']);
    expect(DIFFICULTIES.filter((d) => !DIFFICULTY[d].revealOnFail)).toEqual(['expert']);
  });
});

describe('Stage 7 balance constants', () => {
  it('keeps the default star shares inside the validated content ranges', () => {
    expect(STAR_SHARES.two).toBeGreaterThanOrEqual(CONTENT_TWO_STARS_SHARE.min);
    expect(STAR_SHARES.two).toBeLessThanOrEqual(CONTENT_TWO_STARS_SHARE.max);
    expect(STAR_SHARES.three).toBeGreaterThanOrEqual(CONTENT_THREE_STARS_SHARE.min);
    expect(STAR_SHARES.three).toBeLessThanOrEqual(CONTENT_THREE_STARS_SHARE.max);
  });

  it('pays 10 points and 20 s per proof beyond the first, up to three proofs', () => {
    expect(SCORE.multiStampBonus).toBe(10);
    expect(MULTI_STAMP_EXTRA_DEADLINE_MS).toBe(20_000);
    expect(MAX_REQUIRED_STAMPS).toBe(3);
  });

  it('asks for endless station decks of at least four stories', () => {
    expect(ENDLESS_MIN_DECK).toBe(4);
  });
});
