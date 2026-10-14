import { describe, expect, it } from 'bun:test';
import { emptyPlayerStats, type LobbyPlayer, type PlayerStats } from '@redakcja/shared';
import { pendingAfter } from './feed-model.ts';
import { accuracyOf, statsTeams } from './stats-model.ts';

function player(id: string, team: number, nickname: string): LobbyPlayer {
  return { id, nickname, colorIndex: 0, connected: true, role: null, ready: true, team };
}

const ROSTER = [player('p1', 0, 'Zośka'), player('p2', 1, 'Łukasz'), player('p3', 0, 'Ola')];

function stats(playerId: string, team: number, counters: Partial<PlayerStats>): PlayerStats {
  return { ...emptyPlayerStats(playerId, team), ...counters };
}

describe('accuracyOf', () => {
  it('rounds the share of correct verdicts and has none before the first', () => {
    expect(accuracyOf(4, 5)).toBe(80);
    expect(accuracyOf(2, 3)).toBe(67);
    expect(accuracyOf(0, 0)).toBeNull();
  });
});

describe('statsTeams', () => {
  it('groups the roster by newsroom in join order, zeros for a player without counters', () => {
    const groups = statsTeams([0, 1], ROSTER, [
      stats('p1', 0, { verdicts: 5, correct: 4, stamps: 6, minigameFails: 1, abilities: 2 }),
    ]);
    expect(groups.map((group) => group.rows.map((row) => row.nickname))).toEqual([
      ['Zośka', 'Ola'],
      ['Łukasz'],
    ]);
    expect(groups[0]?.rows[0]).toEqual({
      playerId: 'p1',
      nickname: 'Zośka',
      colorIndex: 0,
      connected: true,
      verdicts: 5,
      pending: 0,
      accuracy: 80,
      stamps: 6,
      minigameFails: 1,
      abilities: 2,
    });
    expect(groups[0]?.rows[1]).toMatchObject({ verdicts: 0, accuracy: null, stamps: 0 });
  });

  it('masked → revealed: a masked verdict counts as given, but only its reveal moves the accuracy', () => {
    // Łukasz has 4 revealed verdicts, 3 of them correct, and has just given a fifth (masked).
    const before = [stats('p2', 1, { verdicts: 4, correct: 3 })];
    const pending = pendingAfter([], {
      type: 'spectatorEvent',
      tick: 50,
      team: 1,
      event: {
        kind: 'verdictMasked',
        playerId: 'p2',
        folderId: 'f6',
        spawnKey: 's5',
        closedBy: 'verdict',
      },
    });
    const masked = statsTeams([1], ROSTER, before, pending)[0]?.rows[0];
    expect(masked).toMatchObject({ verdicts: 5, pending: 1, accuracy: 75 });

    // Revealed (correct): the server's counters take it in and the masked one is gone.
    const revealed = pendingAfter(pending, {
      type: 'spectatorEvent',
      tick: 60,
      team: 1,
      event: {
        kind: 'verdictRevealed',
        result: {
          folderId: 'f6',
          spawnKey: 's5',
          storyId: 'l0-zalany-rynek',
          outcome: 'correct',
          reason: 'correctNormal',
          verdict: 'publish',
          scoreDelta: 15,
          credibilityDelta: 2,
          justifyingStampIds: [],
          requiredStamps: 1,
          bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
          missedStampIds: [],
          playerId: 'p2',
        },
      },
    });
    const after = statsTeams([1], ROSTER, [stats('p2', 1, { verdicts: 5, correct: 4 })], revealed);
    expect(after[0]?.rows[0]).toMatchObject({ verdicts: 5, pending: 0, accuracy: 80 });
  });

  it('leaves out a player who left the room', () => {
    const groups = statsTeams([0], ROSTER, [stats('p9', 0, { verdicts: 3 })]);
    expect(groups[0]?.rows.map((row) => row.playerId)).toEqual(['p1', 'p3']);
  });
});
