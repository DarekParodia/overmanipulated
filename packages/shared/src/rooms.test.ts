import { describe, expect, it } from 'bun:test';
import {
  foldSearch,
  type RoomSummary,
  roomListQuerySchema,
  roomListResponseSchema,
  roomSummarySchema,
} from './rooms.ts';

const SUMMARY: RoomSummary = {
  code: 'ABCD',
  name: '3B piątek',
  hostNickname: 'Ola',
  levelId: 'l1',
  mode: 'versus',
  difficulty: 'normal',
  players: 5,
  maxPlayers: 8,
  spectators: 2,
  spectatorsAllowed: true,
  inGame: false,
  canJoinAsPlayer: true,
  canSpectate: true,
  createdAt: 1_760_000_000_000,
};

describe('foldSearch', () => {
  it('lower-cases and strips Polish diacritics', () => {
    expect(foldSearch('Łukasz Żółć')).toBe('lukasz zolc');
    expect(foldSearch('ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż')).toBe('acelnoszz acelnoszz');
  });

  it('collapses and trims whitespace', () => {
    expect(foldSearch('  3B \t Piątek ')).toBe('3b piatek');
  });
});

describe('roomListQuerySchema', () => {
  it('defaults to any status and 50 rooms', () => {
    expect(roomListQuerySchema.parse({})).toEqual({ status: 'any', limit: 50 });
  });

  it('coerces the limit and keeps the filters', () => {
    expect(
      roomListQuerySchema.parse({
        q: ' piątek ',
        mode: 'coop',
        levelId: 'l2',
        difficulty: 'hard',
        status: 'open',
        limit: '10',
      }),
    ).toEqual({
      q: 'piątek',
      mode: 'coop',
      levelId: 'l2',
      difficulty: 'hard',
      status: 'open',
      limit: 10,
    });
  });

  it('rejects limit 51, limit 0, a 25-character search and an unknown status', () => {
    expect(roomListQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(roomListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(roomListQuerySchema.safeParse({ q: 'a'.repeat(25) }).success).toBe(false);
    expect(roomListQuerySchema.safeParse({ q: 'a'.repeat(24) }).success).toBe(true);
    expect(roomListQuerySchema.safeParse({ status: 'full' }).success).toBe(false);
  });
});

describe('roomSummarySchema', () => {
  it('accepts a summary with every field', () => {
    expect(roomSummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
    expect(roomSummarySchema.safeParse({ ...SUMMARY, name: null }).success).toBe(true);
  });

  it('rejects 9 players, 9 spectators, a missing field and an unknown mode', () => {
    expect(roomSummarySchema.safeParse({ ...SUMMARY, players: 9 }).success).toBe(false);
    expect(roomSummarySchema.safeParse({ ...SUMMARY, spectators: 9 }).success).toBe(false);
    const { createdAt: _createdAt, ...missing } = SUMMARY;
    expect(roomSummarySchema.safeParse(missing).success).toBe(false);
    expect(roomSummarySchema.safeParse({ ...SUMMARY, mode: 'solo' }).success).toBe(false);
  });

  it('caps a response at 50 rooms', () => {
    const rooms = Array.from({ length: 51 }, () => SUMMARY);
    expect(roomListResponseSchema.safeParse({ rooms, total: 51 }).success).toBe(false);
    expect(roomListResponseSchema.safeParse({ rooms: rooms.slice(1), total: 51 }).success).toBe(
      true,
    );
  });
});
