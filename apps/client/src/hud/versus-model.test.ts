import { describe, expect, test } from 'bun:test';
import type { FolderResult, TeamScore } from '@redakcja/shared';
import {
  leadCue,
  leadState,
  pairRivalResults,
  standingsOf,
  teamCardsOf,
  versusVerdict,
} from './versus-model.ts';

function team(index: 0 | 1, score: number, credibility = 50): TeamScore {
  return { team: index, score, credibility, resolved: 3, expired: 1, connected: 2 };
}

function result(spawnKey: string, storyId: string, scoreDelta = 10): FolderResult {
  return {
    folderId: `f${spawnKey.length}`,
    spawnKey,
    storyId,
    outcome: 'correct',
    reason: 'correctNormal',
    verdict: 'publish',
    scoreDelta,
    credibilityDelta: 0,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

describe('lead', () => {
  test('reads ahead, behind and tied from the points', () => {
    expect(leadState(240, 195)).toBe('ahead');
    expect(leadState(195, 240)).toBe('behind');
    expect(leadState(100, 100)).toBe('tied');
  });

  test('cues a lead change once per cooldown, and never a fall back to a tie', () => {
    expect(leadCue('behind', 'ahead', 0, 6000)).toBe('versus.leadTaken');
    expect(leadCue('behind', 'ahead', 0, 3000)).toBeNull();
    expect(leadCue('ahead', 'tied', 0, 6000)).toBeNull();
    expect(leadCue('tied', 'behind', 0, 5000)).toBe('versus.leadLost');
    expect(leadCue('ahead', 'behind', null, 0)).toBe('versus.leadLost');
    expect(leadCue('tied', 'ahead', null, 100)).toBe('versus.leadTaken');
    expect(leadCue('ahead', 'ahead', null, 9000)).toBeNull();
  });

  test('takes both standings from the scoreboard, from this newsroom’s side', () => {
    const board = [team(0, 240, 40), team(1, 195, 55)];
    expect(standingsOf(board, 1)).toEqual({
      own: team(1, 195, 55),
      rival: team(0, 240, 40),
      lead: 'behind',
    });
    expect(standingsOf(board, 0)?.lead).toBe('ahead');
    expect(standingsOf(null, 0)).toBeNull();
    expect(standingsOf([team(0, 10)], 0)).toBeNull();
    expect(teamCardsOf(board, 1)).toEqual({ own: team(1, 195, 55), rival: team(0, 240, 40) });
  });
});

describe('match result', () => {
  test('names the result and the reason from each side', () => {
    expect(versusVerdict({ winnerTeam: 0, reason: 'score' }, 0)).toEqual({
      result: 'win',
      reason: 'score',
    });
    expect(versusVerdict({ winnerTeam: 0, reason: 'score' }, 1)).toEqual({
      result: 'lose',
      reason: 'rivalScore',
    });
    expect(versusVerdict({ winnerTeam: 1, reason: 'credibility' }, 1)).toEqual({
      result: 'win',
      reason: 'rivalCredibility',
    });
    expect(versusVerdict({ winnerTeam: 1, reason: 'credibility' }, 0)).toEqual({
      result: 'lose',
      reason: 'ownCredibility',
    });
    expect(versusVerdict({ winnerTeam: 0, reason: 'forfeit' }, 0)).toEqual({
      result: 'win',
      reason: 'rivalForfeit',
    });
    expect(versusVerdict({ winnerTeam: 0, reason: 'forfeit' }, 1)).toEqual({
      result: 'lose',
      reason: 'ownForfeit',
    });
    expect(versusVerdict({ winnerTeam: null, reason: 'draw' }, 1)).toEqual({
      result: 'draw',
      reason: 'draw',
    });
  });
});

describe('rival folders', () => {
  test('pairs by spawn key when the rival has an extra raid folder', () => {
    // Our fuller belt met the raid with three folders; the rival got four (e0.3 is theirs only),
    // and its folder ids differ from ours from the raid on.
    const own = [
      result('s0', 'a'),
      result('s1', 'b'),
      result('e0.0', 'r'),
      result('e0.1', 'r'),
      result('e0.2', 'r'),
      result('s2', 'c'),
    ];
    const rival = [
      { ...result('s1', 'b', -20), folderId: 'f2' },
      { ...result('s0', 'a', 5), folderId: 'f1' },
      { ...result('e0.3', 'r', 10), folderId: 'f6' },
      { ...result('e0.0', 'r', 10), folderId: 'f3' },
      { ...result('e0.2', 'r', -5), folderId: 'f5' },
      { ...result('s2', 'c', 25), folderId: 'f7' },
    ];
    const paired = pairRivalResults(own, rival);
    expect(paired.map((r) => r?.spawnKey ?? null)).toEqual([
      's0',
      's1',
      'e0.0',
      null,
      'e0.2',
      's2',
    ]);
    expect(paired.map((r) => r?.scoreDelta ?? null)).toEqual([5, -20, 10, null, -5, 25]);
    expect(paired.map((r) => r?.folderId ?? null)).toEqual(['f1', 'f2', 'f3', null, 'f5', 'f7']);
  });

  test('keeps the first result under a repeated key, and nothing without rival results', () => {
    const own = [result('s0', 'a')];
    expect(pairRivalResults(own, [result('s0', 'a', 7), result('s0', 'a', 9)])[0]?.scoreDelta).toBe(
      7,
    );
    expect(pairRivalResults(own, [])).toEqual([null]);
  });
});
