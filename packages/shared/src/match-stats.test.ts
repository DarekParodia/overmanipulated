import { describe, expect, it } from 'bun:test';
import { type FolderResult, NO_BONUSES } from './entities.ts';
import { applyStatsEvent, emptyPlayerStats, teamScoreOf } from './match-stats.ts';
import type { GameEvent } from './protocol.ts';

function result(patch: Partial<FolderResult> = {}): FolderResult {
  return {
    folderId: 'f1',
    spawnKey: 's0',
    storyId: 'l1-story',
    outcome: 'correct',
    reason: 'correctNormal',
    verdict: 'reject',
    scoreDelta: 100,
    credibilityDelta: 0,
    justifyingStampIds: ['st-a'],
    requiredStamps: 1,
    bonuses: NO_BONUSES,
    missedStampIds: [],
    ...patch,
  };
}

function verdictEvent(patch: Partial<FolderResult>, playerId = 'p1'): GameEvent {
  return { ...result(patch), kind: 'verdictResult', playerId, verdict: 'reject' };
}

describe('emptyPlayerStats', () => {
  it('starts every counter at zero', () => {
    expect(emptyPlayerStats('p1', 1)).toEqual({
      playerId: 'p1',
      team: 1,
      verdicts: 0,
      correct: 0,
      wrong: 0,
      stamps: 0,
      minigameFails: 0,
      abilities: 0,
    });
  });
});

describe('applyStatsEvent', () => {
  const empty = emptyPlayerStats('p1', 0);

  it('counts a correct verdict as a verdict and a correct one', () => {
    const stats = applyStatsEvent(empty, verdictEvent({ outcome: 'correct' }));
    expect(stats).toMatchObject({ verdicts: 1, correct: 1, wrong: 0 });
  });

  it('counts a wrong justification as a verdict only', () => {
    const event = verdictEvent({ outcome: 'wrongJustification', reason: 'weakProof' });
    expect(applyStatsEvent(empty, event)).toMatchObject({ verdicts: 1, correct: 0, wrong: 0 });
  });

  it('counts a wrong verdict', () => {
    const event = verdictEvent({ outcome: 'wrong', reason: 'publishedFake' });
    expect(applyStatsEvent(empty, event)).toMatchObject({ verdicts: 1, correct: 0, wrong: 1 });
  });

  it('counts a stamp, whatever earned it', () => {
    const base = {
      kind: 'stampApplied',
      stationId: 'st1',
      playerId: 'p1',
      folderId: 'f1',
    } as const;
    const once = applyStatsEvent(empty, { ...base, stampId: 'st-a', via: 'minigame' });
    const twice = applyStatsEvent(once, { ...base, stampId: 'st-b', via: 'fieldCall' });
    expect(once.stamps).toBe(1);
    expect(twice.stamps).toBe(2);
  });

  it('counts a failed minigame', () => {
    const event: GameEvent = {
      kind: 'minigameFailed',
      stationId: 'st1',
      playerId: 'p1',
      folderId: 'f1',
      lockoutMs: 3000,
    };
    expect(applyStatsEvent(empty, event).minigameFails).toBe(1);
  });

  it('counts an ability only when it is done', () => {
    const base = { kind: 'ability', playerId: 'p1', ability: 'expertise' } as const;
    const armed = applyStatsEvent(empty, { ...base, stage: 'armed' });
    const started = applyStatsEvent(armed, { ...base, stage: 'started' });
    const done = applyStatsEvent(started, { ...base, stage: 'done' });
    expect(armed.abilities).toBe(0);
    expect(started.abilities).toBe(0);
    expect(done.abilities).toBe(1);
  });

  it("leaves the stats unchanged for another player's event", () => {
    expect(applyStatsEvent(empty, verdictEvent({ outcome: 'correct' }, 'p2'))).toBe(empty);
    const failed: GameEvent = {
      kind: 'minigameFailed',
      stationId: 'st1',
      playerId: 'p2',
      folderId: 'f1',
      lockoutMs: 3000,
    };
    expect(applyStatsEvent(empty, failed)).toBe(empty);
  });

  it('ignores events that are not counted', () => {
    const pickUp: GameEvent = { kind: 'folderPickedUp', folderId: 'f1', playerId: 'p1' };
    expect(applyStatsEvent(empty, pickUp)).toBe(empty);
    expect(applyStatsEvent(empty, { kind: 'gameStarted' })).toBe(empty);
  });

  it('folds a whole event list', () => {
    const events: GameEvent[] = [
      verdictEvent({ outcome: 'correct' }),
      verdictEvent({ outcome: 'wrong', reason: 'rejectedTrue' }),
      verdictEvent({ outcome: 'correct' }, 'p2'),
    ];
    expect(events.reduce(applyStatsEvent, empty)).toMatchObject({
      verdicts: 2,
      correct: 1,
      wrong: 1,
    });
  });
});

describe('teamScoreOf', () => {
  it('counts verdicts as resolved and expiries as expired, never unfinished folders', () => {
    const game = {
      score: 140,
      credibility: 35,
      results: [
        result({ folderId: 'f1' }),
        result({ folderId: 'f2', outcome: 'wrong', reason: 'publishedFake', verdict: 'publish' }),
        result({
          folderId: 'f3',
          outcome: 'wrongJustification',
          reason: 'weakProof',
          verdict: 'reject',
        }),
        result({ folderId: 'f4', outcome: 'expired', reason: 'expired', verdict: null }),
        result({ folderId: 'f5', outcome: 'expired', reason: 'expiredUnpenalized', verdict: null }),
        result({ folderId: 'f6', outcome: 'unfinished', reason: 'unfinished', verdict: null }),
      ],
    };
    expect(teamScoreOf(game, 1, 3)).toEqual({
      team: 1,
      score: 140,
      credibility: 35,
      resolved: 3,
      expired: 2,
      connected: 3,
    });
  });
});
