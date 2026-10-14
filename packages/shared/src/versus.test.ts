import { describe, expect, it } from 'bun:test';
import { byScore, matchDurationMs, type TeamStanding, versusOutcome } from './versus.ts';

const A: TeamStanding = { team: 0, score: 120, credibility: 40, forfeited: false };
const B: TeamStanding = { team: 1, score: 90, credibility: 55, forfeited: false };
const DURATION = 480_000;

describe('matchDurationMs', () => {
  it('caps endless at 600 s and keeps a level its own duration', () => {
    expect(matchDurationMs({ durationS: 86400, endless: true })).toBe(600_000);
    expect(matchDurationMs({ durationS: 480 })).toBe(480_000);
    expect(matchDurationMs({ durationS: 420, endless: false })).toBe(420_000);
  });
});

describe('versusOutcome', () => {
  it('goes on before time is up while both newsrooms stand', () => {
    expect(versusOutcome([A, B], 479_950, DURATION)).toBeNull();
  });

  it('gives the match to the higher score when time is up', () => {
    expect(versusOutcome([A, B], 480_000, DURATION)).toEqual({ winnerTeam: 0, reason: 'score' });
    expect(versusOutcome([A, B], 480_050, DURATION)).toEqual({ winnerTeam: 0, reason: 'score' });
  });

  it('ends early when one newsroom loses its credibility, whatever the scores', () => {
    const broke = { ...B, score: 300, credibility: 0 };
    expect(versusOutcome([A, broke], 100_000, DURATION)).toEqual({
      winnerTeam: 0,
      reason: 'credibility',
    });
    expect(versusOutcome([{ ...A, credibility: -5 }, B], 100_000, DURATION)).toEqual({
      winnerTeam: 1,
      reason: 'credibility',
    });
  });

  it('decides by score when both lose their credibility on the same tick', () => {
    const both = [
      { ...A, score: 50, credibility: 0 },
      { ...B, score: 70, credibility: 0 },
    ];
    expect(versusOutcome(both, 100_000, DURATION)).toEqual({ winnerTeam: 1, reason: 'score' });
  });

  it('calls equal scores at time-out a draw', () => {
    const level = [
      { ...A, score: 100 },
      { ...B, score: 100 },
    ];
    expect(versusOutcome(level, 480_000, DURATION)).toEqual({ winnerTeam: null, reason: 'draw' });
  });

  it('calls a simultaneous credibility loss with equal scores a draw', () => {
    const both = [
      { ...A, score: 40, credibility: 0 },
      { ...B, score: 40, credibility: 0 },
    ];
    expect(versusOutcome(both, 100_000, DURATION)).toEqual({ winnerTeam: null, reason: 'draw' });
  });

  it('gives a forfeit to the newsroom that stayed', () => {
    expect(versusOutcome([A, { ...B, forfeited: true }], 100_000, DURATION)).toEqual({
      winnerTeam: 0,
      reason: 'forfeit',
    });
    expect(versusOutcome([{ ...A, forfeited: true }, B], 100_000, DURATION)).toEqual({
      winnerTeam: 1,
      reason: 'forfeit',
    });
  });

  it('reports credibility, not forfeit, when the out newsroom ran out of credibility', () => {
    const broke = { ...B, credibility: 0 };
    expect(versusOutcome([A, broke], 100_000, DURATION)?.reason).toBe('credibility');
  });
});

describe('byScore', () => {
  it('ranks the higher score first and calls a tie a draw', () => {
    expect(byScore([B, A])).toEqual({ winnerTeam: 0, reason: 'score' });
    expect(byScore([A, { ...B, score: 120 }])).toEqual({ winnerTeam: null, reason: 'draw' });
    expect(byScore([])).toEqual({ winnerTeam: null, reason: 'draw' });
  });
});
