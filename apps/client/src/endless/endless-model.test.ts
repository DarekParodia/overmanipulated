import { describe, expect, it } from 'bun:test';
import type { LeaderboardEntry } from '@redakcja/shared';
import { isBetterRun, parseEndlessBest } from '../store/progress.ts';
import {
  ENDLESS_TEMPO_STEP_MS,
  endlessUnlocked,
  findOwnRun,
  formatElapsed,
  formatPlayers,
  formatSurvived,
  survivedSeconds,
  tempoLevel,
} from './endless-model.ts';

const training = { id: 'l0-training', stations: [] };
const levels = [training, { id: 'l1-first', stations: [] }, { id: 'l2-second', stations: [] }];

const entry = (patch: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  roomCode: 'ABCD',
  players: ['Ola'],
  score: 100,
  survivedS: 120,
  createdAt: 1000,
  ...patch,
});

describe('endless unlock', () => {
  it('needs a star on level 1', () => {
    expect(endlessUnlocked(levels, {})).toBe(false);
    expect(endlessUnlocked(levels, { 'l1-first': 0 })).toBe(false);
    expect(endlessUnlocked(levels, { 'l1-first': 1 })).toBe(true);
    expect(endlessUnlocked(levels, { 'l0-training': 3, 'l2-second': 3 })).toBe(false);
  });

  it('stays locked when the campaign has no level 1', () => {
    expect(endlessUnlocked([training], { 'l0-training': 3 })).toBe(false);
  });
});

describe('tempo and clock', () => {
  it('grows by one each minute', () => {
    expect(tempoLevel(0)).toBe(1);
    expect(tempoLevel(ENDLESS_TEMPO_STEP_MS - 1)).toBe(1);
    expect(tempoLevel(ENDLESS_TEMPO_STEP_MS)).toBe(2);
    expect(tempoLevel(5.5 * ENDLESS_TEMPO_STEP_MS)).toBe(6);
    expect(tempoLevel(-5)).toBe(1);
  });

  it('counts up in whole seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(59_999)).toBe('0:59');
    expect(formatElapsed(61_000)).toBe('1:01');
    expect(formatSurvived(754)).toBe('12:34');
  });

  it('prefers the server survival time', () => {
    expect(survivedSeconds(95, 10_000)).toBe(95);
    expect(survivedSeconds(undefined, 10_900)).toBe(10);
  });
});

describe('local best', () => {
  it('beats a missing best, a lower score, or a longer run on equal score', () => {
    expect(isBetterRun({ score: 1, survivedS: 1 }, null)).toBe(true);
    expect(isBetterRun({ score: 5, survivedS: 1 }, { score: 4, survivedS: 99 })).toBe(true);
    expect(isBetterRun({ score: 4, survivedS: 1 }, { score: 5, survivedS: 1 })).toBe(false);
    expect(isBetterRun({ score: 5, survivedS: 60 }, { score: 5, survivedS: 30 })).toBe(true);
    expect(isBetterRun({ score: 5, survivedS: 30 }, { score: 5, survivedS: 30 })).toBe(false);
  });

  it('reads stored data defensively', () => {
    expect(parseEndlessBest(null)).toBeNull();
    expect(parseEndlessBest('{oops')).toBeNull();
    expect(parseEndlessBest('[1]')).toBeNull();
    expect(parseEndlessBest('{"score":"3","survivedS":4}')).toBeNull();
    expect(parseEndlessBest('{"score":3,"survivedS":-4}')).toBeNull();
    expect(parseEndlessBest('{"score":-3,"survivedS":4}')).toEqual({ score: -3, survivedS: 4 });
  });
});

describe('leaderboard rows', () => {
  const run = { roomCode: 'ABCD', score: 100, survivedS: 120 };

  it('finds the own run by room, score and survival time', () => {
    const rows = [entry({ roomCode: 'ZZZZ' }), entry({}), entry({ score: 90 })];
    expect(findOwnRun(rows, run)).toBe(1);
    expect(findOwnRun(rows, { ...run, survivedS: 121 })).toBe(1);
    expect(findOwnRun(rows, { ...run, survivedS: 125 })).toBe(-1);
    expect(findOwnRun([], run)).toBe(-1);
  });

  it('picks the newest of identical runs', () => {
    const rows = [entry({ createdAt: 5 }), entry({ createdAt: 9 }), entry({ createdAt: 7 })];
    expect(findOwnRun(rows, run)).toBe(1);
  });

  it('lists the crew', () => {
    expect(formatPlayers(['Ola', 'Kuba'])).toBe('Ola, Kuba');
  });
});
