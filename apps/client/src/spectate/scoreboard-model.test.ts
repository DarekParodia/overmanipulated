import { describe, expect, test } from 'bun:test';
import type { TeamScore } from '@redakcja/shared';
import { scoreSides } from './scoreboard-model.ts';

const LIVE = [
  { score: 240, credibility: 72 },
  { score: 195, credibility: 55 },
];
const live = (team: number) => LIVE[team] ?? { score: 0, credibility: 0 };

const STANDINGS: TeamScore[] = [
  { team: 0, score: 230, credibility: 72, resolved: 6, expired: 1, connected: 2 },
  { team: 1, score: 195, credibility: 55, resolved: 5, expired: 2, connected: 2 },
];

describe('scoreSides', () => {
  test('versus: live points, folder counts from the standings, a crown for the leader', () => {
    expect(scoreSides([0, 1], live, STANDINGS)).toEqual([
      { team: 0, score: 240, credibility: 72, resolved: 6, expired: 1, leader: true },
      { team: 1, score: 195, credibility: 55, resolved: 5, expired: 2, leader: false },
    ]);
  });

  test('a tie crowns nobody', () => {
    const tied = () => ({ score: 100, credibility: 50 });
    expect(scoreSides([0, 1], tied, STANDINGS).map((side) => side.leader)).toEqual([false, false]);
  });

  test('co-op has one side and no crown; counts are 0 before the first stats', () => {
    expect(scoreSides([0], live, null)).toEqual([
      { team: 0, score: 240, credibility: 72, resolved: 0, expired: 0, leader: false },
    ]);
  });
});
