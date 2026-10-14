import { describe, expect, it } from 'bun:test';
import type { LobbyPlayer, LobbySpectator, RoomMode } from '@redakcja/shared';
import {
  hostChanged,
  joinedSpectators,
  lookChanges,
  modeSwitched,
  teamSwitches,
} from './room-diff.ts';

function player(
  id: string,
  team: 0 | 1,
  look: Pick<LobbyPlayer, 'colorIndex' | 'accessory'> = { colorIndex: 0, accessory: 'none' },
): LobbyPlayer {
  return { id, nickname: id, connected: true, role: null, ready: false, team, ...look };
}

function spectator(id: string): LobbySpectator {
  return { id, nickname: id, connected: true };
}

function state(
  spectators: LobbySpectator[],
  players: LobbyPlayer[] = [player('p1', 0)],
  mode: RoomMode = 'coop',
  roomCode = 'ABCD',
) {
  return { roomCode, mode, players, spectators };
}

describe('joinedSpectators', () => {
  it('names the spectators who were not watching before', () => {
    const before = state([spectator('s1')]);
    const after = state([spectator('s1'), spectator('s2'), spectator('s3')]);
    expect(joinedSpectators(before, after, 'p1').map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('never announces the local member, the first state or another room', () => {
    expect(joinedSpectators(state([]), state([spectator('me')]), 'me')).toEqual([]);
    expect(joinedSpectators(null, state([spectator('s1')]), 'p1')).toEqual([]);
    expect(
      joinedSpectators(state([]), state([spectator('s1')], undefined, 'coop', 'WXYZ'), 'p1'),
    ).toEqual([]);
  });

  it('announces a player who moved to the Widownia, but not one who left it', () => {
    const before = state([spectator('s1')], [player('p1', 0), player('p2', 0)]);
    const moved = state([spectator('s1'), spectator('p2')], [player('p1', 0)]);
    expect(joinedSpectators(before, moved, 'p1').map((s) => s.id)).toEqual(['p2']);
    expect(joinedSpectators(moved, before, 'p1')).toEqual([]);
  });
});

describe('modeSwitched and teamSwitches', () => {
  it('sees a mode switch and leaves the re-dealt teams to it', () => {
    const coop = state([], [player('a', 0), player('b', 0)], 'coop');
    const versus = state([], [player('a', 0), player('b', 1)], 'versus');
    expect(modeSwitched(coop, versus)).toBe(true);
    expect(modeSwitched(versus, versus)).toBe(false);
    expect(modeSwitched(null, versus)).toBe(false);
    expect(teamSwitches(coop, versus)).toEqual([]);
  });

  it('lists the players who changed newsroom, not the ones who joined', () => {
    const before = state([], [player('a', 0), player('b', 1)], 'versus');
    const after = state([], [player('a', 1), player('b', 1), player('c', 0)], 'versus');
    expect(teamSwitches(before, after)).toEqual(['a']);
    expect(teamSwitches(after, after)).toEqual([]);
  });
});

describe('hostChanged', () => {
  it('sees the host move to another member of the same room', () => {
    expect(
      hostChanged({ roomCode: 'ABCD', hostId: 'p1' }, { roomCode: 'ABCD', hostId: 'p2' }),
    ).toBe(true);
    expect(
      hostChanged({ roomCode: 'ABCD', hostId: 'p1' }, { roomCode: 'ABCD', hostId: 'p1' }),
    ).toBe(false);
  });

  it('ignores the first state and another room', () => {
    expect(hostChanged(null, { roomCode: 'ABCD', hostId: 'p1' })).toBe(false);
    expect(
      hostChanged({ roomCode: 'ABCD', hostId: 'p1' }, { roomCode: 'WXYZ', hostId: 'p2' }),
    ).toBe(false);
  });
});

describe('lookChanges (S7-105)', () => {
  it('names the players whose accessory or colour changed in the same newsroom', () => {
    const before = state([], [player('p1', 0), player('p2', 0), player('p3', 0)]);
    const after = state(
      [],
      [
        player('p1', 0),
        player('p2', 0, { colorIndex: 0, accessory: 'scarf' }),
        player('p3', 0, { colorIndex: 2, accessory: 'none' }),
      ],
    );
    expect(lookChanges(before, after, 'p1')).toEqual(['p2', 'p3']);
  });

  it('never names the local member, a team move, a mode switch or a newcomer', () => {
    const before = state([], [player('me', 0), player('p2', 0)], 'versus');
    const after = state(
      [],
      [
        player('me', 0, { colorIndex: 1, accessory: 'bowTie' }),
        player('p2', 1, { colorIndex: 3, accessory: 'none' }),
        player('p3', 0, { colorIndex: 2, accessory: 'scarf' }),
      ],
      'versus',
    );
    expect(lookChanges(before, after, 'me')).toEqual([]);
    const coop = state([], [player('p2', 0, { colorIndex: 3, accessory: 'scarf' })], 'coop');
    expect(lookChanges(before, coop, 'me')).toEqual([]);
    expect(lookChanges(null, after, 'me')).toEqual([]);
  });
});
