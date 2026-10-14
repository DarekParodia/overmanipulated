import { describe, expect, it } from 'bun:test';
import type { GameEvent, PlayerStats } from '@redakcja/shared';
import {
  accuracy,
  emptyProfile,
  favouriteRole,
  type Profile,
  parseProfile,
  type Seat,
  withEvent,
  withLevelEnd,
  withoutStats,
} from './profile-model.ts';

const ME: Seat = { playerId: 'p1', team: 0, role: 'archivist' };

function verdict(outcome: 'correct' | 'wrong' | 'wrongJustification', playerId = 'p1'): GameEvent {
  return {
    kind: 'verdictResult',
    playerId,
    verdict: 'publish',
    folderId: 'f1',
    spawnKey: 's1',
    storyId: 'l0-nocny-autobus',
    outcome,
    reason:
      outcome === 'correct' ? 'correctNormal' : outcome === 'wrong' ? 'publishedFake' : 'weakProof',
    scoreDelta: 10,
    credibilityDelta: 0,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

const STAMP: GameEvent = {
  kind: 'stampApplied',
  stationId: 'st1',
  playerId: 'p1',
  folderId: 'f1',
  stampId: 'l0-nocny-autobus-archive',
  via: 'minigame',
};

function fold(events: readonly GameEvent[], seat: Seat | null = ME): PlayerStats | null {
  return events.reduce<PlayerStats | null>((tally, event) => withEvent(tally, event, seat), null);
}

describe('profile storage', () => {
  it('starts empty with no colour and no accessory', () => {
    expect(emptyProfile()).toEqual({
      levels: 0,
      wins: 0,
      verdicts: 0,
      correct: 0,
      wrong: 0,
      stamps: 0,
      minigameFails: 0,
      abilities: 0,
      roleLevels: {},
      color: null,
      accessory: 'none',
    });
    expect(parseProfile(null)).toEqual(emptyProfile());
    expect(parseProfile('{not json')).toEqual(emptyProfile());
  });

  it('falls back field by field on bad values', () => {
    const parsed = parseProfile(
      JSON.stringify({
        levels: 4,
        wins: -1,
        correct: 2.5,
        roleLevels: { archivist: 3 },
        color: 7,
        accessory: 'scarf',
      }),
    );
    expect(parsed.levels).toBe(4);
    expect(parsed.wins).toBe(0);
    expect(parsed.correct).toBe(0);
    expect(parsed.roleLevels).toEqual({ archivist: 3 });
    expect(parsed.color).toBeNull();
    expect(parsed.accessory).toBe('scarf');
    expect(parseProfile(JSON.stringify({ roleLevels: { mascot: 2 }, accessory: 'hat' }))).toEqual(
      emptyProfile(),
    );
  });
});

describe('match tally', () => {
  it('counts only the local player through the shared accumulator', () => {
    const tally = fold([verdict('correct'), verdict('correct', 'p2'), STAMP, verdict('wrong')]);
    expect(tally).toEqual({
      playerId: 'p1',
      team: 0,
      verdicts: 2,
      correct: 1,
      wrong: 1,
      stamps: 1,
      minigameFails: 0,
      abilities: 0,
    });
  });

  it('keeps no tally for a spectator', () => {
    expect(fold([verdict('correct')], null)).toBeNull();
  });

  it('starts over when the seat changes', () => {
    const old = fold([verdict('correct'), verdict('correct')]);
    const tally = withEvent(old, verdict('wrong', 'p9'), { playerId: 'p9', team: 1, role: null });
    expect(tally?.playerId).toBe('p9');
    expect(tally?.team).toBe(1);
    expect(tally?.verdicts).toBe(1);
    expect(tally?.correct).toBe(0);
  });
});

describe('level end', () => {
  it('adds the level, the win, the role and the local tally', () => {
    const tally = fold([verdict('correct'), verdict('correct'), verdict('wrong'), STAMP]);
    const profile = withLevelEnd(emptyProfile(), { won: true }, ME, tally);
    expect(profile.levels).toBe(1);
    expect(profile.wins).toBe(1);
    expect(profile.verdicts).toBe(3);
    expect(profile.correct).toBe(2);
    expect(profile.wrong).toBe(1);
    expect(profile.stamps).toBe(1);
    expect(profile.roleLevels).toEqual({ archivist: 1 });
    expect(accuracy(profile)).toBe(67);
  });

  it("prefers the server's stats for this player", () => {
    const tally = fold([verdict('correct')]);
    const stats: PlayerStats[] = [
      {
        playerId: 'p2',
        team: 0,
        verdicts: 9,
        correct: 9,
        wrong: 0,
        stamps: 9,
        minigameFails: 9,
        abilities: 9,
      },
      {
        playerId: 'p1',
        team: 0,
        verdicts: 4,
        correct: 3,
        wrong: 1,
        stamps: 5,
        minigameFails: 2,
        abilities: 1,
      },
    ];
    const profile = withLevelEnd(emptyProfile(), { won: false, stats }, ME, tally);
    expect(profile.wins).toBe(0);
    expect(profile.verdicts).toBe(4);
    expect(profile.correct).toBe(3);
    expect(profile.stamps).toBe(5);
    expect(profile.minigameFails).toBe(2);
    expect(profile.abilities).toBe(1);
  });

  it('counts a level without a role or a tally', () => {
    const profile = withLevelEnd(emptyProfile(), { won: true }, { ...ME, role: null }, null);
    expect(profile.levels).toBe(1);
    expect(profile.verdicts).toBe(0);
    expect(profile.roleLevels).toEqual({});
  });
});

describe('derived stats', () => {
  it('gives 67 % for two correct verdicts and one wrong', () => {
    expect(accuracy({ verdicts: 3, correct: 2 })).toBe(67);
    expect(accuracy({ verdicts: 0, correct: 0 })).toBeNull();
  });

  it('picks the role with most levels; a tie goes to the earlier role in ROLES', () => {
    expect(favouriteRole({ roleLevels: {} })).toBeNull();
    expect(favouriteRole({ roleLevels: { reporter: 2, archivist: 3 } })).toBe('archivist');
    // ROLES order: photoEditor, archivist, reporter, …
    expect(favouriteRole({ roleLevels: { reporter: 2, archivist: 2 } })).toBe('archivist');
    expect(favouriteRole({ roleLevels: { rescuer: 1, photoEditor: 1 } })).toBe('photoEditor');
  });

  it('clears the statistics and keeps the look', () => {
    const profile: Profile = {
      ...emptyProfile(),
      levels: 3,
      correct: 2,
      roleLevels: { reporter: 3 },
      color: 2,
      accessory: 'bowTie',
    };
    expect(withoutStats(profile)).toEqual({ ...emptyProfile(), color: 2, accessory: 'bowTie' });
  });
});
