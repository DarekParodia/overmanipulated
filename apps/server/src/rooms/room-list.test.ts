// The room list's pure parts (S7-83): order, search fields, query and the time-to-live cache.
import { describe, expect, it } from 'bun:test';
import type { RoomSummary } from '@redakcja/shared';
import { compareRoomList, createRoomListCache, queryRoomList, roomListEntry } from './room-list.ts';

function summary(code: string, fields: Partial<RoomSummary> = {}): RoomSummary {
  return {
    code,
    name: null,
    hostNickname: 'Ola',
    levelId: 'l0-greybox',
    mode: 'coop',
    difficulty: 'normal',
    players: 1,
    maxPlayers: 4,
    spectators: 0,
    spectatorsAllowed: false,
    inGame: false,
    canJoinAsPlayer: true,
    canSpectate: false,
    createdAt: 1000,
    ...fields,
  };
}

describe('compareRoomList', () => {
  it('puts joinable rooms first, then the newest, then the code', () => {
    const rooms = [
      summary('DDDD', { canJoinAsPlayer: false, createdAt: 5000 }),
      summary('CCCC', { createdAt: 1000 }),
      summary('BBBB', { createdAt: 3000 }),
      summary('AAAA', { createdAt: 1000 }),
    ];
    expect(rooms.sort(compareRoomList).map((r) => r.code)).toEqual([
      'BBBB',
      'AAAA',
      'CCCC',
      'DDDD',
    ]);
  });
});

describe('roomListEntry and queryRoomList', () => {
  it('folds the code, name and host nickname, skipping a missing name', () => {
    expect(
      roomListEntry(summary('ABCD', { name: '3B Piątek', hostNickname: 'Łucja' })).search,
    ).toEqual(['abcd', '3b piatek', 'lucja']);
    expect(roomListEntry(summary('ABCD')).search).toEqual(['abcd', 'ola']);
  });

  it('does not match across two fields', () => {
    const entries = [roomListEntry(summary('ABCD', { name: 'Klasa' }))];
    const query = { q: 'abcd klasa', status: 'any', limit: 50 } as const;
    expect(queryRoomList(entries, query)).toEqual({ rooms: [], total: 0 });
  });
});

describe('createRoomListCache', () => {
  it('rebuilds only once the time to live has passed', () => {
    const clock = { time: 0 };
    let rooms = [summary('AAAA')];
    const cache = createRoomListCache({ now: () => clock.time, ttlMs: 2000, build: () => rooms });
    expect(cache.entries()).toHaveLength(1);
    rooms = [summary('AAAA'), summary('BBBB')];
    clock.time = 1999;
    expect(cache.entries()).toHaveLength(1);
    expect(cache.builds).toBe(1);
    clock.time = 2000;
    expect(cache.entries()).toHaveLength(2);
    expect(cache.builds).toBe(2);
  });
});
