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
  deadlineExtensionUsed: false,
  nextFolder: { atMs: 3000, sinceMs: 0 },
  conveyorFull: false,
  paused: false,
};

describe('protocol version', () => {
  it('is 4 for the Stage 7 M2 wire (difficulty-scaled lockout, difficulty and run)', () => {
    expect(PROTOCOL_VERSION).toBe(4);
  });
});

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
      parseClientMessage({ type: 'command', command: { kind: 'verdict', folderId: 'f1' } }).ok,
    ).toBe(false);
    expect(parseClientMessage({ type: 'heartbeat', clientTime: 123.4 }).ok).toBe(true);
  });

  it('accepts the in-game menu pause with a boolean only', () => {
    const pause = (paused: unknown) =>
      parseClientMessage({ type: 'lobby', action: { kind: 'setPaused', paused } }).ok;
    expect(pause(true)).toBe(true);
    expect(pause(false)).toBe(true);
    expect(pause('yes')).toBe(false);
    expect(parseClientMessage({ type: 'lobby', action: { kind: 'setPaused' } }).ok).toBe(false);
  });

  it('accepts a verdict citing one to three stamps, and nothing else', () => {
    const verdict = (justifyingStampIds: unknown) =>
      parseClientMessage({
        type: 'command',
        command: {
          kind: 'verdict',
          folderId: 'f1',
          verdict: 'publishWithContext',
          justifyingStampIds,
        },
      }).ok;
    expect(verdict(['s1'])).toBe(true);
    expect(verdict(['s1', 's2'])).toBe(true);
    expect(verdict(['s1', 's2', 's3'])).toBe(true);
    expect(verdict([])).toBe(false);
    expect(verdict(['s1', 's2', 's3', 's4'])).toBe(false);
    expect(verdict('s1')).toBe(false);
    // The pre-v3 single stamp field is gone.
    expect(
      parseClientMessage({
        type: 'command',
        command: { kind: 'verdict', folderId: 'f1', verdict: 'reject', justifyingStampId: 's1' },
      }).ok,
    ).toBe(false);
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
        briefing: null,
        blunderVotes: [],
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
            spawnKey: 's0',
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
        lossReason: null,
        starThresholds: { two: 120, three: 190 },
        maxScore: 240,
      },
      { type: 'event', tick: 3, event: { kind: 'playerJoined', playerId: 'p1' } },
      { type: 'error', code: 'roomFull' },
      { type: 'heartbeatAck', clientTime: 1 },
    ];
    for (const message of messages) {
      expect(parseServerMessage(message).ok).toBe(true);
    }
  });

  it('carries a verdict result as a folder result with the deciding player', () => {
    const verdictResult = {
      kind: 'verdictResult',
      folderId: 'f1',
      spawnKey: 'e2.1',
      storyId: 'l1-story',
      playerId: 'p1',
      outcome: 'wrongJustification',
      reason: 'incompleteProof',
      verdict: 'publish',
      scoreDelta: 5,
      credibilityDelta: 0,
      justifyingStampIds: ['l1-story-ai'],
      requiredStamps: 1,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    };
    const parse = (event: unknown) => parseServerMessage({ type: 'event', tick: 4, event }).ok;
    expect(parse(verdictResult)).toBe(true);
    expect(parse({ ...verdictResult, reason: 'lucky' })).toBe(false);
    expect(parse({ ...verdictResult, verdict: null })).toBe(false);
    expect(parse({ ...verdictResult, justifyingStampIds: ['a', 'b', 'c', 'd'] })).toBe(false);
    expect(parse({ ...verdictResult, requiredStamps: 0 })).toBe(false);
    expect(parse({ ...verdictResult, bonuses: { speed: -5, multiStamp: 0, bossCall: 0 } })).toBe(
      false,
    );
    const { spawnKey: _key, ...withoutKey } = verdictResult;
    expect(parse(withoutKey)).toBe(false);
  });

  it('takes spawn keys s<scheduleIndex> and e<eventIndex>.<waveIndex> only', () => {
    const expired = (spawnKey: unknown) =>
      parseServerMessage({
        type: 'event',
        tick: 4,
        event: { kind: 'folderExpired', folderId: 'f3', spawnKey, storyId: 'l1-story', stamps: [] },
      }).ok;
    for (const key of ['s0', 's12', 'e0.0', 'e3.2']) {
      expect(expired(key)).toBe(true);
    }
    for (const key of ['f1', 's', 'e3', 'e3.', 's-1', 's1.0', 'e1.0.0', ' s1', '', 3]) {
      expect(expired(key)).toBe(false);
    }
    expect(
      parseServerMessage({
        type: 'event',
        tick: 4,
        event: { kind: 'folderExpired', folderId: 'f3', storyId: 'l1-story', stamps: [] },
      }).ok,
    ).toBe(false);
  });

  it('carries the lockout of a failed minigame', () => {
    const failed = {
      kind: 'minigameFailed',
      stationId: 'sourceRegistry-0',
      playerId: 'p1',
      folderId: 'f3',
      lockoutMs: 6000,
    };
    const parse = (event: unknown) => parseServerMessage({ type: 'event', tick: 9, event }).ok;
    expect(parse(failed)).toBe(true);
    expect(parse({ ...failed, lockoutMs: 0 })).toBe(true);
    const { lockoutMs: _dropped, ...withoutLockout } = failed;
    expect(parse(withoutLockout)).toBe(false);
    expect(parse({ ...failed, lockoutMs: -1 })).toBe(false);
    expect(parse({ ...failed, lockoutMs: 1500.5 })).toBe(false);
  });

  it('accepts an endless levelEnd with an unfinished folder and no thresholds', () => {
    const end = {
      type: 'levelEnd',
      levelId: 'endless',
      won: false,
      stars: 0,
      score: 120,
      credibility: 0,
      results: [
        {
          folderId: 'f9',
          spawnKey: 's7',
          storyId: 'l3-story',
          outcome: 'unfinished',
          reason: 'unfinished',
          verdict: null,
          scoreDelta: 0,
          credibilityDelta: 0,
          justifyingStampIds: [],
          requiredStamps: 1,
          bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
          missedStampIds: ['l3-story-image'],
        },
      ],
      lossReason: 'credibility',
      starThresholds: null,
      maxScore: null,
      survivedS: 312,
    };
    expect(parseServerMessage(end).ok).toBe(true);
    expect(parseServerMessage({ ...end, lossReason: 'time' }).ok).toBe(false);
    const { lossReason: _dropped, ...withoutReason } = end;
    expect(parseServerMessage(withoutReason).ok).toBe(false);
  });

  it('carries the next scheduled folder and the conveyor-full flag in every snapshot', () => {
    const snapshot = { type: 'snapshot', tick: 1, players: [], ...EMPTY_LEVEL };
    expect(parseServerMessage(snapshot).ok).toBe(true);
    expect(parseServerMessage({ ...snapshot, nextFolder: null, conveyorFull: true }).ok).toBe(true);
    expect(parseServerMessage({ ...snapshot, nextFolder: { atMs: 3000 } }).ok).toBe(false);
    const beforeStart = { ...snapshot, nextFolder: { atMs: -1, sinceMs: 0 } };
    expect(parseServerMessage(beforeStart).ok).toBe(false);
    const { nextFolder: _next, ...withoutNext } = snapshot;
    expect(parseServerMessage(withoutNext).ok).toBe(false);
    const { conveyorFull: _full, ...withoutFull } = snapshot;
    expect(parseServerMessage(withoutFull).ok).toBe(false);
  });

  it('says in every snapshot whether the room is paused', () => {
    const snapshot = { type: 'snapshot', tick: 1, players: [], ...EMPTY_LEVEL };
    expect(parseServerMessage({ ...snapshot, paused: true }).ok).toBe(true);
    expect(parseServerMessage({ ...snapshot, paused: 1 }).ok).toBe(false);
    const { paused: _paused, ...withoutPaused } = snapshot;
    expect(parseServerMessage(withoutPaused).ok).toBe(false);
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
