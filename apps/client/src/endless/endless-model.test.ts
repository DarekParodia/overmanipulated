import { describe, expect, it } from 'bun:test';
import type { LeaderboardEntry } from '@redakcja/shared';
import { endlessBestOn, endlessRunFrom, isBetterRun, parseEndlessBest } from '../store/progress.ts';
import {
  ENDLESS_TEMPO_STEP_MS,
  endlessUnlocked,
  findOwnRun,
  formatElapsed,
  formatPlayers,
  formatSurvived,
  leaderboardQuery,
  survivedSeconds,
  tempoLevel,
} from './endless-model.ts';

const training = { id: 'l0-training', stations: [] };
const levels = [training, { id: 'l1-first', stations: [] }, { id: 'l2-second', stations: [] }];

const entry = (patch: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  roomCode: 'ABCD',
  players: ['Ola'],
  score: 100,
  difficulty: 'normal',
  survivedS: 120,
  createdAt: 1000,
  ...patch,
});

describe('endless unlock', () => {
  it('needs a star on level 1', () => {
    expect(endlessUnlocked(levels, {})).toBe(false);
    expect(endlessUnlocked(levels, { normal: { 'l1-first': 0 } })).toBe(false);
    expect(endlessUnlocked(levels, { normal: { 'l1-first': 1 } })).toBe(true);
    expect(endlessUnlocked(levels, { normal: { 'l0-training': 3, 'l2-second': 3 } })).toBe(false);
  });

  it('counts a star on level 1 from any difficulty', () => {
    expect(endlessUnlocked(levels, { expert: { 'l1-first': 1 } })).toBe(true);
    expect(endlessUnlocked(levels, { easy: { 'l1-first': 0 }, hard: { 'l1-first': 2 } })).toBe(
      true,
    );
  });

  it('stays locked when the campaign has no level 1', () => {
    expect(endlessUnlocked([training], { normal: { 'l0-training': 3 } })).toBe(false);
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

  it('reads one stored run defensively', () => {
    expect(endlessRunFrom(null)).toBeNull();
    expect(endlessRunFrom([1])).toBeNull();
    expect(endlessRunFrom({ score: '3', survivedS: 4 })).toBeNull();
    expect(endlessRunFrom({ score: 3, survivedS: -4 })).toBeNull();
    expect(endlessRunFrom({ score: -3, survivedS: 4 })).toEqual({ score: -3, survivedS: 4 });
  });

  it('keeps the best run per difficulty', () => {
    expect(parseEndlessBest(null)).toEqual({});
    expect(parseEndlessBest('{oops')).toEqual({});
    expect(
      parseEndlessBest(
        '{"hard":{"score":40,"survivedS":200},"easy":{"score":"x","survivedS":1},"insane":{"score":9,"survivedS":9}}',
      ),
    ).toEqual({ hard: { score: 40, survivedS: 200 } });
    const best = { hard: { score: 40, survivedS: 200 } };
    expect(endlessBestOn(best, 'hard')).toEqual({ score: 40, survivedS: 200 });
    expect(endlessBestOn(best, 'normal')).toBeNull();
  });

  it('migrates the v1 best run into normal', () => {
    expect(parseEndlessBest(null, '{"score":75,"survivedS":310}')).toEqual({
      normal: { score: 75, survivedS: 310 },
    });
    expect(parseEndlessBest(null, '{"score":75}')).toEqual({});
    expect(parseEndlessBest('{}', '{"score":75,"survivedS":310}')).toEqual({});
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

  it('asks for one scope and one difficulty', () => {
    expect(leaderboardQuery('global', 'ABCD', 'hard', 10)).toBe(
      'scope=global&difficulty=hard&limit=10',
    );
    expect(leaderboardQuery('room', 'ABCD', 'normal', 10)).toBe(
      'scope=room&difficulty=normal&limit=10&room=ABCD',
    );
    expect(leaderboardQuery('room', null, 'expert', 5)).toBe(
      'scope=room&difficulty=expert&limit=5',
    );
  });

  it('lists the crew', () => {
    expect(formatPlayers(['Ola', 'Kuba'])).toBe('Ola, Kuba');
  });
});
