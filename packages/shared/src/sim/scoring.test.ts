import { describe, expect, it } from 'bun:test';
import type { GameEvent } from '../protocol.ts';
import { runStep, TEST_MAP, testContext } from './__fixtures__/greybox.ts';
import type { SimFrame } from './frame.ts';
import { applyCredibility, starsFor, stepScoring } from './scoring.ts';
import { createGameState, type GameState } from './state.ts';

function frameWith(events: GameEvent[]): SimFrame {
  return { ctx: testContext(), intents: {}, commands: [], events };
}

const expired = (folderId: string, storyId: string, stamps: string[] = []): GameEvent => ({
  kind: 'folderExpired',
  stamps,
  folderId,
  storyId,
});

const base = (overrides: Partial<GameState> = {}): GameState => ({
  ...createGameState({ map: TEST_MAP }),
  elapsedMs: 10_000,
  ...overrides,
});

describe('stepScoring — expiry', () => {
  it('takes 5 points and 5 credibility for an expired folder', () => {
    const next = stepScoring(base(), frameWith([expired('f1', 't-true')]));
    expect(next.score).toBe(-5);
    expect(next.credibility).toBe(95);
    expect(next.results).toEqual([
      {
        folderId: 'f1',
        storyId: 't-true',
        outcome: 'expired',
        verdict: null,
        scoreDelta: -5,
        credibilityDelta: -5,
        missedStampIds: ['t-true-image'],
      },
    ]);
  });

  it('does not penalise an unverifiable, non-urgent story that expires', () => {
    const next = stepScoring(base(), frameWith([expired('f1', 't-unverifiable')]));
    expect(next.score).toBe(0);
    expect(next.credibility).toBe(100);
    expect(next.results[0]).toMatchObject({
      outcome: 'expired',
      scoreDelta: 0,
      credibilityDelta: 0,
    });
  });

  it('penalises an urgent unverifiable story that expires', () => {
    const next = stepScoring(base(), frameWith([expired('f1', 't-unverifiable-urgent')]));
    expect(next.score).toBe(-5);
    expect(next.credibility).toBe(95);
  });

  it('ignores other events', () => {
    const state = base();
    const next = stepScoring(state, frameWith([{ kind: 'gameStarted' }]));
    expect(next).toBe(state);
  });
});

describe('applyCredibility', () => {
  it('stays within 0 and 100', () => {
    expect(applyCredibility(98, 5)).toBe(100);
    expect(applyCredibility(3, -25)).toBe(0);
    expect(applyCredibility(50, -10)).toBe(40);
  });
});

describe('stepScoring — level end', () => {
  const STARS = { two: 30, three: 60 };

  it('gives 1 star for a positive score, 2 and 3 at the level thresholds', () => {
    expect(starsFor(1, true, STARS)).toBe(1);
    expect(starsFor(29, true, STARS)).toBe(1);
    expect(starsFor(30, true, STARS)).toBe(2);
    expect(starsFor(59, true, STARS)).toBe(2);
    expect(starsFor(60, true, STARS)).toBe(3);
    expect(starsFor(80, false, STARS)).toBe(0);
  });

  it('keeps running before the level time is up', () => {
    const next = stepScoring(base({ elapsedMs: 119_950, score: 40 }), frameWith([]));
    expect(next.ended).toBeNull();
  });

  it('ends the level on time-out with stars by score', () => {
    const end = (score: number) =>
      stepScoring(base({ elapsedMs: 120_000, score }), frameWith([])).ended;
    expect(end(10)).toEqual({ won: true, stars: 1 });
    expect(end(30)).toEqual({ won: true, stars: 2 });
    expect(end(60)).toEqual({ won: true, stars: 3 });
  });

  it('loses on time-out without a positive score', () => {
    expect(stepScoring(base({ elapsedMs: 120_000, score: 0 }), frameWith([])).ended).toEqual({
      won: false,
      stars: 0,
    });
  });

  it('loses at once when credibility reaches 0', () => {
    const next = stepScoring(
      base({ credibility: 5, score: 50 }),
      frameWith([expired('f1', 't-true')]),
    );
    expect(next.credibility).toBe(0);
    expect(next.ended).toEqual({ won: false, stars: 0 });
  });

  it('sets the outcome only once', () => {
    const ended = { won: true, stars: 3 };
    const state = base({ elapsedMs: 120_000, score: 0, ended });
    expect(stepScoring(state, frameWith([])).ended).toBe(ended);
  });

  it('ends the level through step on time-out and then freezes the state', () => {
    let state = base({ elapsedMs: 120_000 - 50, score: 35 });
    const last = runStep(state);
    state = last.state;
    expect(state.ended).toEqual({ won: true, stars: 2 });
    const after = runStep(state);
    expect(after.state).toBe(state);
  });
});
