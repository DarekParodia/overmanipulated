import { describe, expect, it } from 'bun:test';
import { PROTOCOL_VERSION } from './constants.ts';
import { encodeMessage, parseClientMessage, parseServerMessage } from './protocol.ts';

const EMPTY_LEVEL = {
  elapsedMs: 0,
  timeLeftMs: 120_000,
  score: 0,
  credibility: 100,
  folders: [],
  stations: [],
  desks: [],
};

describe('client messages', () => {
  it('accepts a join that creates a room', () => {
    const result = parseClientMessage({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname: 'Zośka',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a join with a room code and trims the nickname', () => {
    const result = parseClientMessage({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname: '  Łukasz  ',
      roomCode: 'ABCD',
    });
    expect(result.ok && result.message.type === 'join' && result.message.nickname).toBe('Łukasz');
  });

  it.each([
    ['empty nickname', { nickname: '   ' }],
    ['too long nickname', { nickname: 'x'.repeat(17) }],
    ['control characters', { nickname: 'a\u0000b' }],
    ['room code with I', { nickname: 'Ala', roomCode: 'ABCI' }],
    ['lowercase room code', { nickname: 'Ala', roomCode: 'abcd' }],
    ['short room code', { nickname: 'Ala', roomCode: 'ABC' }],
  ])('rejects a join with %s', (_name, fields) => {
    const result = parseClientMessage({ type: 'join', protocolVersion: 1, ...fields });
    expect(result.ok).toBe(false);
  });

  it('accepts a valid input', () => {
    const result = parseClientMessage({
      type: 'input',
      seq: 12,
      move: { x: 0.5, y: -1 },
      actions: { interact: false, work: true },
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['axis out of range', { seq: 1, move: { x: 2, y: 0 } }],
    ['negative seq', { seq: -1, move: { x: 0, y: 0 } }],
    ['fractional seq', { seq: 1.5, move: { x: 0, y: 0 } }],
  ])('rejects an input with %s', (_name, fields) => {
    const result = parseClientMessage({
      type: 'input',
      actions: { interact: false, work: false },
      ...fields,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts lobby actions, commands and heartbeat', () => {
    expect(parseClientMessage({ type: 'lobby', action: { kind: 'start' } }).ok).toBe(true);
    expect(
      parseClientMessage({ type: 'lobby', action: { kind: 'setRole', role: 'archivist' } }).ok,
    ).toBe(true);
    expect(
      parseClientMessage({ type: 'lobby', action: { kind: 'setRole', role: 'boss' } }).ok,
    ).toBe(false);
    expect(
      parseClientMessage({
        type: 'command',
        command: {
          kind: 'verdict',
          folderId: 'f1',
          verdict: 'publishWithContext',
          justifyingStampId: 's1',
        },
      }).ok,
    ).toBe(true);
    expect(
      parseClientMessage({ type: 'command', command: { kind: 'verdict', folderId: 'f1' } }).ok,
    ).toBe(false);
    expect(parseClientMessage({ type: 'heartbeat', clientTime: 123.4 }).ok).toBe(true);
  });

  it('rejects unknown types and malformed JSON', () => {
    expect(parseClientMessage({ type: 'cheat' }).ok).toBe(false);
    expect(parseClientMessage('{not json').ok).toBe(false);
  });

  it('round-trips through encodeMessage', () => {
    const message = { type: 'heartbeat', clientTime: 5 } as const;
    const result = parseClientMessage(encodeMessage(message));
    expect(result).toEqual({ ok: true, message });
  });
});

describe('server messages', () => {
  it('accepts welcome, roomState, snapshot, event, error and heartbeatAck', () => {
    const messages = [
      { type: 'welcome', playerId: 'p1', roomCode: 'KLMN', reconnectToken: 'x'.repeat(32) },
      {
        type: 'roomState',
        roomCode: 'KLMN',
        hostId: 'p1',
        phase: 'lobby',
        levelId: 'l0-greybox',
        players: [
          {
            id: 'p1',
            nickname: 'Ala',
            colorIndex: 0,
            connected: true,
            role: null,
            ready: false,
          },
        ],
      },
      {
        type: 'snapshot',
        tick: 10,
        players: [{ id: 'p1', x: 1.5, y: 2.5, facing: 0, moving: true, lastInputSeq: 4 }],
        ...EMPTY_LEVEL,
        folders: [
          {
            id: 'f1',
            storyId: 'l0-story',
            location: { kind: 'carried', playerId: 'p1' },
            stamps: [],
            spawnedAtMs: 0,
            deadlineMs: 60_000,
            warned: false,
          },
        ],
      },
      {
        type: 'levelEnd',
        levelId: 'l0-greybox',
        won: true,
        stars: 2,
        score: 40,
        credibility: 90,
        results: [],
      },
      { type: 'event', tick: 3, event: { kind: 'playerJoined', playerId: 'p1' } },
      { type: 'error', code: 'roomFull' },
      { type: 'heartbeatAck', clientTime: 1 },
    ];
    for (const message of messages) {
      expect(parseServerMessage(message).ok).toBe(true);
    }
  });

  it('rejects a snapshot with more than four players', () => {
    const player = { id: 'p', x: 0, y: 0, facing: 0, moving: false, lastInputSeq: -1 };
    const result = parseServerMessage({
      type: 'snapshot',
      tick: 1,
      players: Array.from({ length: 5 }, () => player),
      ...EMPTY_LEVEL,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown error code and an out-of-range colour', () => {
    expect(parseServerMessage({ type: 'error', code: 'oops' }).ok).toBe(false);
    expect(
      parseServerMessage({
        type: 'roomState',
        roomCode: 'KLMN',
        hostId: 'p1',
        phase: 'lobby',
        levelId: 'l0-greybox',
        players: [
          {
            id: 'p1',
            nickname: 'Ala',
            colorIndex: 4,
            connected: true,
            role: null,
            ready: false,
          },
        ],
      }).ok,
    ).toBe(false);
  });
});
