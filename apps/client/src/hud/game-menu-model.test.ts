import { describe, expect, it } from 'bun:test';
import type { RoomStateMessage } from '@redakcja/shared';
import {
  connectedPlayers,
  LEAVE_CONFIRM_MS,
  leavePress,
  menuStatus,
  wantsPause,
} from './game-menu-model.ts';

function room(connected: boolean[]): RoomStateMessage {
  return {
    type: 'roomState',
    roomCode: 'ABCD',
    hostId: 'p1',
    phase: 'playing',
    levelId: 'l0-greybox',
    difficulty: 'normal',
    run: null,
    players: connected.map((online, i) => ({
      id: `p${i + 1}`,
      nickname: `Gracz ${i + 1}`,
      colorIndex: i,
      connected: online,
      role: null,
      ready: false,
      team: 0,
    })),
    briefing: null,
    blunderVotes: [],
    mode: 'coop',
    visibility: 'private',
    name: null,
    spectatorsAllowed: false,
    spectators: [],
  };
}

describe('in-game menu model (S7-10)', () => {
  it('counts only connected people', () => {
    expect(connectedPlayers(null)).toBe(0);
    expect(connectedPlayers(room([true]))).toBe(1);
    expect(connectedPlayers(room([true, false, true]))).toBe(2);
  });

  it('asks for a pause only for an open menu in a solo level', () => {
    expect(wantsPause(true, 'playing', 1)).toBe(true);
    expect(wantsPause(false, 'playing', 1)).toBe(false);
    expect(wantsPause(true, 'playing', 2)).toBe(false);
    expect(wantsPause(true, 'results', 1)).toBe(false);
    expect(wantsPause(true, null, 1)).toBe(false);
  });

  it('shows „Pauza” solo and „Gra trwa dalej” with teammates', () => {
    expect(menuStatus('playing', 1, false)).toBe('paused');
    expect(menuStatus('playing', 1, true)).toBe('paused');
    expect(menuStatus('playing', 2, false)).toBe('live');
    // A teammate joining clears the pause on the server; the chip follows the room.
    expect(menuStatus('playing', 3, false)).toBe('live');
    expect(menuStatus('results', 1, false)).toBeNull();
  });

  it('leaves only on a second press within three seconds', () => {
    expect(LEAVE_CONFIRM_MS).toBe(3000);
    const first = leavePress(null, 10_000);
    expect(first).toEqual({ leave: false, armedAt: 10_000 });
    expect(leavePress(first.armedAt, 12_500)).toEqual({ leave: true, armedAt: null });
    expect(leavePress(first.armedAt, 13_000)).toEqual({ leave: true, armedAt: null });
    // Too late: the press arms it again instead.
    expect(leavePress(first.armedAt, 13_001)).toEqual({ leave: false, armedAt: 13_001 });
  });
});
