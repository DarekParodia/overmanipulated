import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { GameEvent, LevelEndMessage, RoomStateMessage } from '@redakcja/shared';
import { useApp } from './app.ts';
import { useProfile } from './profile.ts';
import { emptyProfile } from './profile-model.ts';

const ROOM: RoomStateMessage = {
  type: 'roomState',
  roomCode: 'KLMN',
  hostId: 'p1',
  phase: 'playing',
  levelId: 'l0-greybox',
  players: [
    {
      id: 'p1',
      nickname: 'Zośka',
      colorIndex: 0,
      connected: true,
      role: 'reporter',
      ready: true,
      team: 0,
    },
  ],
  briefing: null,
  blunderVotes: [],
  difficulty: 'normal',
  run: null,
  mode: 'coop',
  visibility: 'private',
  name: null,
  spectatorsAllowed: true,
  spectators: [{ id: 's1', nickname: 'Widz', connected: true }],
};

const LEVEL_END: LevelEndMessage = {
  type: 'levelEnd',
  levelId: 'l0-greybox',
  difficulty: 'normal',
  won: true,
  stars: 2,
  score: 40,
  credibility: 80,
  results: [],
  lossReason: null,
  starThresholds: { two: 30, three: 60 },
  maxScore: 80,
};

function verdict(outcome: 'correct' | 'wrong', playerId: string): GameEvent {
  return {
    kind: 'verdictResult',
    playerId,
    verdict: 'reject',
    folderId: 'f1',
    spawnKey: 's1',
    storyId: 'l0-zalany-rynek',
    outcome,
    reason: outcome === 'correct' ? 'correctNormal' : 'rejectedTrue',
    scoreDelta: 10,
    credibilityDelta: 0,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

beforeEach(() => {
  useApp.setState({ playerId: 'p1', room: ROOM });
  useProfile.setState({ profile: emptyProfile(), tally: null, open: false });
});

// The stores are module singletons shared with other test files: leave no seat behind.
afterEach(() => {
  useApp.setState(useApp.getInitialState(), true);
  useProfile.setState({ profile: emptyProfile(), tally: null, open: false });
});

describe('profile tracking (S7-104)', () => {
  it('adds a played level with its verdicts and role', () => {
    const profile = useProfile.getState();
    profile.startMatch();
    profile.trackEvent(verdict('correct', 'p1'));
    profile.trackEvent(verdict('correct', 'p1'));
    profile.trackEvent(verdict('wrong', 'p1'));
    profile.recordLevelEnd(LEVEL_END);
    const after = useProfile.getState();
    expect(after.profile.levels).toBe(1);
    expect(after.profile.wins).toBe(1);
    expect(after.profile.verdicts).toBe(3);
    expect(after.profile.correct).toBe(2);
    expect(after.profile.wrong).toBe(1);
    expect(after.profile.roleLevels).toEqual({ reporter: 1 });
    expect(after.tally).toBeNull();
  });

  it('skips a spectator', () => {
    useApp.setState({ playerId: 's1' });
    const profile = useProfile.getState();
    profile.trackEvent(verdict('correct', 's1'));
    profile.recordLevelEnd(LEVEL_END);
    expect(useProfile.getState().tally).toBeNull();
    expect(useProfile.getState().profile).toEqual(emptyProfile());
  });

  it('drops the tally of a level the player walked out of', () => {
    const profile = useProfile.getState();
    profile.trackEvent(verdict('correct', 'p1'));
    profile.startMatch();
    profile.recordLevelEnd({ ...LEVEL_END, won: false });
    expect(useProfile.getState().profile.levels).toBe(1);
    expect(useProfile.getState().profile.wins).toBe(0);
    expect(useProfile.getState().profile.verdicts).toBe(0);
  });

  it('keeps the look when the statistics are cleared', () => {
    const profile = useProfile.getState();
    profile.setColor(3);
    profile.setAccessory('pressCard');
    profile.recordLevelEnd(LEVEL_END);
    profile.clearStats();
    expect(useProfile.getState().profile).toEqual({
      ...emptyProfile(),
      color: 3,
      accessory: 'pressCard',
    });
  });
});
