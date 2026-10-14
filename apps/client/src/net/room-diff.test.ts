import { describe, expect, it } from 'bun:test';
import type { LobbyPlayer, LobbySpectator, RoomMode } from '@redakcja/shared';
import { joinedSpectators, modeSwitched, teamSwitches } from './room-diff.ts';

function player(id: string, team: 0 | 1): LobbyPlayer {
  return { id, nickname: id, colorIndex: 0, connected: true, role: null, ready: false, team };
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
