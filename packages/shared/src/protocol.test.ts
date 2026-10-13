import { describe, expect, it } from 'bun:test';
import { PROTOCOL_VERSION } from './constants.ts';
import {
  encodeMessage,
  parseClientMessage,
  parseServerMessage,
  verdictMaskedEventSchema,
} from './protocol.ts';

const EMPTY_LEVEL = {
  elapsedMs: 0,
  timeLeftMs: 120_000,
  score: 0,
  credibility: 100,
  folders: [],
  stations: [],
  desks: [],
  nextFolder: { atMs: 3000, sinceMs: 0 },
  conveyorFull: false,
  crew: [],
  paused: false,
};

/** The room fields protocol 7 added to every roomState (S7-77), at a new room's values. */
const ROOM_DEFAULTS = {
  mode: 'coop',
  visibility: 'private',
  name: null,
  spectatorsAllowed: false,
  spectators: [],
};

describe('protocol version', () => {
  it('is 7 for the Stage 7 M6 wire (rooms, versus, spectators)', () => {
    expect(PROTOCOL_VERSION).toBe(7);
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

  it('accepts setDifficulty with the four difficulties only (S7-23)', () => {
    const set = (difficulty: unknown) =>
      parseClientMessage({ type: 'lobby', action: { kind: 'setDifficulty', difficulty } }).ok;
    expect(set('easy')).toBe(true);
    expect(set('normal')).toBe(true);
    expect(set('hard')).toBe(true);
    expect(set('expert')).toBe(true);
    expect(set('insane')).toBe(false);
    expect(set(undefined)).toBe(false);
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

  it('accepts a target-free useAbility press (S7-36)', () => {
    const command = (command: unknown) => parseClientMessage({ type: 'command', command }).ok;
    expect(command({ kind: 'useAbility' })).toBe(true);
    expect(command({ kind: 'useAbilities' })).toBe(false);
  });

  it('no longer accepts the once-per-level extendDeadline command or its event (S7-37)', () => {
    const command = (command: unknown) => parseClientMessage({ type: 'command', command }).ok;
    expect(command({ kind: 'extendDeadline', folderId: 'f1' })).toBe(false);
    const event = (event: unknown) => parseServerMessage({ type: 'event', tick: 4, event }).ok;
    expect(event({ kind: 'deadlineExtended', folderId: 'f1', playerId: 'p1' })).toBe(false);
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
        difficulty: 'normal',
        run: null,
        ...ROOM_DEFAULTS,
        players: [
          {
            id: 'p1',
            nickname: 'Ala',
            colorIndex: 0,
            connected: true,
            role: null,
            ready: false,
            team: 0,
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
        difficulty: 'normal',
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

  it('carries every player’s ability state in the snapshot (S7-36)', () => {
    const member = {
      id: 'p1',
      abilityReadyAtMs: 63_000,
      abilityArmed: false,
      fieldCall: { folderId: 'f2', endsAtMs: 9000 },
      rescuesLeft: 1,
    };
    const parse = (crew: unknown) =>
      parseServerMessage({ type: 'snapshot', tick: 1, players: [], ...EMPTY_LEVEL, crew }).ok;
    expect(parse([member])).toBe(true);
    expect(
      parse([{ ...member, id: 'p2', abilityArmed: true, fieldCall: null, rescuesLeft: 0 }]),
    ).toBe(true);
    expect(parse(Array.from({ length: 5 }, () => member))).toBe(false);
    expect(parse([{ ...member, rescuesLeft: -1 }])).toBe(false);
    expect(parse([{ ...member, fieldCall: { folderId: 'f2' } }])).toBe(false);
    const { abilityArmed: _armed, ...withoutArmed } = member;
    expect(parse([withoutArmed])).toBe(false);
    const { crew: _crew, ...withoutCrew } = EMPTY_LEVEL;
    expect(parseServerMessage({ type: 'snapshot', tick: 1, players: [], ...withoutCrew }).ok).toBe(
      false,
    );
  });

  it('carries ability stages and rescued folders as events (S7-36)', () => {
    const parse = (event: unknown) => parseServerMessage({ type: 'event', tick: 7, event }).ok;
    const ability = { kind: 'ability', playerId: 'p1', ability: 'extendDeadline', stage: 'done' };
    expect(parse({ ...ability, folderId: 'f1', addedMs: 20_000 })).toBe(true);
    for (const stage of ['armed', 'disarmed', 'started', 'done', 'cancelled']) {
      expect(parse({ ...ability, ability: 'expertise', stage })).toBe(true);
    }
    expect(parse({ ...ability, ability: 'fieldCall', stage: 'cancelled', reason: 'dropped' })).toBe(
      true,
    );
    expect(parse({ ...ability, ability: 'passFolder', folderId: 'f1', targetPlayerId: 'p2' })).toBe(
      true,
    );
    expect(parse({ ...ability, ability: 'secondChance', stationId: 'archive-0' })).toBe(true);
    expect(parse({ ...ability, ability: 'teleport' })).toBe(false);
    expect(parse({ ...ability, stage: 'charging' })).toBe(false);
    expect(parse({ ...ability, reason: 'bored' })).toBe(false);

    const rescued = {
      kind: 'folderRescued',
      playerId: 'p3',
      folderId: 'f4',
      addedMs: 20_000,
      folderIds: ['f4', 'f5'],
    };
    expect(parse(rescued)).toBe(true);
    expect(parse({ ...rescued, folderIds: [] })).toBe(false);
    expect(parse({ ...rescued, folderIds: Array.from({ length: 9 }, (_, i) => `f${i}`) })).toBe(
      false,
    );
  });

  it('says what earned a stamp (S7-36)', () => {
    const stamp = {
      kind: 'stampApplied',
      stationId: 'phone-0',
      playerId: 'p1',
      folderId: 'f1',
      stampId: 'l3-story-phone',
    };
    const parse = (event: unknown) => parseServerMessage({ type: 'event', tick: 7, event }).ok;
    expect(parse({ ...stamp, via: 'minigame' })).toBe(true);
    expect(parse({ ...stamp, via: 'expertise' })).toBe(true);
    expect(parse({ ...stamp, via: 'fieldCall' })).toBe(true);
    expect(parse({ ...stamp, via: 'magic' })).toBe(false);
    expect(parse(stamp)).toBe(false);
  });

  it('lets a folder carry the time abilities added to it (S7-36)', () => {
    const folder = {
      id: 'f1',
      spawnKey: 's0',
      storyId: 'l1-story',
      location: { kind: 'carried', playerId: 'p1' },
      stamps: [],
      spawnedAtMs: 0,
      deadlineMs: 80_000,
      warned: false,
    };
    const parse = (f: unknown) =>
      parseServerMessage({ type: 'snapshot', tick: 1, players: [], ...EMPTY_LEVEL, folders: [f] })
        .ok;
    expect(parse({ ...folder, extendedMs: 20_000 })).toBe(true);
    expect(parse({ ...folder, extendedMs: -1 })).toBe(false);
  });

  it('accepts an endless levelEnd with an unfinished folder and no thresholds', () => {
    const end = {
      type: 'levelEnd',
      levelId: 'endless',
      difficulty: 'hard',
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
    const { difficulty: _difficulty, ...withoutDifficulty } = end;
    expect(parseServerMessage(withoutDifficulty).ok).toBe(false);
  });

  it("carries the room's difficulty and the dealt run in roomState (S7-23)", () => {
    const room = {
      type: 'roomState',
      roomCode: 'KLMN',
      hostId: 'p1',
      phase: 'briefing',
      levelId: 'l1-burza',
      players: [],
      briefing: { endsInMs: 8000, skippedBy: [] },
      blunderVotes: [],
      difficulty: 'expert',
      run: { folders: 16, maxScore: 410, stars: { two: 225, three: 330 } },
      ...ROOM_DEFAULTS,
    };
    const parse = (message: unknown) => parseServerMessage(message).ok;
    expect(parse(room)).toBe(true);
    expect(parse({ ...room, run: { folders: 40, maxScore: 1200, stars: null } })).toBe(true);
    expect(parse({ ...room, phase: 'lobby', briefing: null, run: null })).toBe(true);
    expect(parse({ ...room, difficulty: 'insane' })).toBe(false);
    expect(parse({ ...room, run: { folders: -1, maxScore: 410, stars: null } })).toBe(false);
    const { difficulty: _difficulty, ...withoutDifficulty } = room;
    expect(parse(withoutDifficulty)).toBe(false);
    const { run: _run, ...withoutRun } = room;
    expect(parse(withoutRun)).toBe(false);
  });

  it("lets a folder carry its bag slot's station, optionally (S7-23)", () => {
    const folder = {
      id: 'f1',
      spawnKey: 's0',
      storyId: 'l1-story',
      location: { kind: 'fixture', fixtureId: 'conveyor-0' },
      stamps: [],
      spawnedAtMs: 0,
      deadlineMs: 60_000,
      warned: false,
    };
    const parse = (f: unknown) =>
      parseServerMessage({
        type: 'snapshot',
        tick: 1,
        players: [],
        ...EMPTY_LEVEL,
        folders: [f],
      }).ok;
    expect(parse(folder)).toBe(true);
    expect(parse({ ...folder, bagStation: 'imageSearch' })).toBe(true);
    expect(parse({ ...folder, bagStation: 'map' })).toBe(false);
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

  it('carries the Stage 7 station kinds and rejects unknown ones (S7-48)', () => {
    const station = {
      id: 'metadata-0',
      kind: 'metadata',
      operatorId: null,
      phase: 'idle',
      progressMs: 0,
      durationMs: 4000,
      minigameSeed: 0,
      lockoutMs: 0,
      outageMs: 0,
    };
    const snapshot = { type: 'snapshot', tick: 1, players: [], ...EMPTY_LEVEL };
    for (const kind of ['geolocation', 'transcript', 'crossCheck', 'metadata']) {
      expect(parseServerMessage({ ...snapshot, stations: [{ ...station, kind }] }).ok).toBe(true);
    }
    expect(parseServerMessage({ ...snapshot, stations: [{ ...station, kind: 'foo' }] }).ok).toBe(
      false,
    );
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
        briefing: null,
        blunderVotes: [],
        difficulty: 'normal',
        run: null,
        ...ROOM_DEFAULTS,
        players: [
          {
            id: 'p1',
            nickname: 'Ala',
            colorIndex: 4,
            connected: true,
            role: null,
            ready: false,
            team: 0,
          },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe('rooms, versus and spectators (S7-77)', () => {
  const lobby = (action: unknown) => parseClientMessage({ type: 'lobby', action }).ok;
  const server = (message: unknown) => parseServerMessage(message).ok;

  const player = (i: number, team: number) => ({
    id: `p${i}`,
    nickname: `Gracz ${i}`,
    colorIndex: i % 4,
    connected: true,
    role: null,
    ready: false,
    team,
  });
  const spectator = (i: number) => ({ id: `p${i}`, nickname: `Widz ${i}`, connected: true });
  const room = {
    type: 'roomState',
    roomCode: 'KLMN',
    hostId: 'p1',
    phase: 'lobby',
    levelId: 'l2-wybory',
    briefing: null,
    blunderVotes: [],
    difficulty: 'normal',
    run: null,
    mode: 'versus',
    visibility: 'public',
    name: '3B piątek',
    spectatorsAllowed: true,
    spectators: [spectator(9)],
    players: [player(1, 0), player(2, 1)],
  };
  const teamScore = (team: number) => ({
    team,
    score: 120,
    credibility: 80,
    resolved: 6,
    expired: 1,
    connected: 2,
  });
  const result = {
    folderId: 'f3',
    spawnKey: 's2',
    storyId: 'l2-story',
    outcome: 'correct',
    reason: 'correctNormal',
    verdict: 'reject',
    scoreDelta: 25,
    credibilityDelta: 0,
    justifyingStampIds: ['l2-story-archive'],
    requiredStamps: 1,
    bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
  const stampFields = {
    stationId: 'archive-0',
    playerId: 'p1',
    folderId: 'f3',
    stampId: 'l2-story-archive',
    via: 'minigame',
  };
  const stats = (i: number, team: number) => ({
    playerId: `p${i}`,
    team,
    verdicts: 4,
    correct: 3,
    wrong: 1,
    stamps: 7,
    minigameFails: 2,
    abilities: 1,
  });

  it('accepts a join as a player or a spectator, with an optional client id', () => {
    const join = { type: 'join', protocolVersion: PROTOCOL_VERSION, nickname: 'Zośka' };
    const parse = (fields: object) => parseClientMessage({ ...join, ...fields }).ok;
    expect(parse({})).toBe(true);
    expect(parse({ as: 'player', roomCode: 'KLMN' })).toBe(true);
    expect(parse({ as: 'spectator', roomCode: 'KLMN', clientId: 'a'.repeat(16) })).toBe(true);
    expect(parse({ clientId: '0f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b' })).toBe(true);
    expect(parse({ as: 'watcher' })).toBe(false);
    expect(parse({ clientId: 'a'.repeat(15) })).toBe(false);
    expect(parse({ clientId: 'a'.repeat(65) })).toBe(false);
    expect(parse({ clientId: `${'a'.repeat(16)} b` })).toBe(false);
  });

  it('accepts the eight room lobby actions', () => {
    expect(lobby({ kind: 'setMode', mode: 'versus' })).toBe(true);
    expect(lobby({ kind: 'setMode', mode: 'coop' })).toBe(true);
    expect(lobby({ kind: 'setTeam', team: 1 })).toBe(true);
    expect(lobby({ kind: 'setTeam', team: 0, playerId: 'p3' })).toBe(true);
    expect(lobby({ kind: 'setSpectator', spectator: true })).toBe(true);
    expect(lobby({ kind: 'setSpectator', spectator: false, playerId: 'p2' })).toBe(true);
    expect(lobby({ kind: 'setVisibility', visibility: 'public' })).toBe(true);
    expect(lobby({ kind: 'setRoomName', name: '3B piątek' })).toBe(true);
    expect(lobby({ kind: 'setRoomName', name: null })).toBe(true);
    expect(lobby({ kind: 'setSpectatorsAllowed', allowed: true })).toBe(true);
    expect(lobby({ kind: 'kick', playerId: 'p2' })).toBe(true);
    expect(lobby({ kind: 'transferHost', playerId: 'p2' })).toBe(true);
  });

  it('rejects team 2, unknown modes and malformed admin actions', () => {
    expect(lobby({ kind: 'setTeam', team: 2 })).toBe(false);
    expect(lobby({ kind: 'setTeam', team: -1 })).toBe(false);
    expect(lobby({ kind: 'setTeam', team: 0.5 })).toBe(false);
    expect(lobby({ kind: 'setMode', mode: 'solo' })).toBe(false);
    expect(lobby({ kind: 'setVisibility', visibility: 'hidden' })).toBe(false);
    expect(lobby({ kind: 'setSpectatorsAllowed', allowed: 'yes' })).toBe(false);
    expect(lobby({ kind: 'kick' })).toBe(false);
    expect(lobby({ kind: 'transferHost', playerId: '' })).toBe(false);
  });

  it('trims room names and takes 1 to 24 characters without control characters', () => {
    const named = (name: unknown) =>
      parseClientMessage({ type: 'lobby', action: { kind: 'setRoomName', name } });
    const trimmed = named('  Klasa 3B  ');
    expect(
      trimmed.ok &&
        trimmed.message.type === 'lobby' &&
        trimmed.message.action.kind === 'setRoomName' &&
        trimmed.message.action.name,
    ).toBe('Klasa 3B');
    expect(named('Ż'.repeat(24)).ok).toBe(true);
    expect(named('Ż'.repeat(25)).ok).toBe(false);
    expect(named('   ').ok).toBe(false);
    expect(named('Klasa\u00003B').ok).toBe(false);
    expect(named('Klasa\n3B').ok).toBe(false);
    expect(named('Klasa\u200e3B').ok).toBe(false);
  });

  it('carries mode, visibility, name, Widownia, spectators and teams in roomState', () => {
    expect(server(room)).toBe(true);
    expect(server({ ...room, ...ROOM_DEFAULTS })).toBe(true);
    for (const field of ['mode', 'visibility', 'name', 'spectatorsAllowed', 'spectators']) {
      const { [field]: _dropped, ...without } = room as Record<string, unknown>;
      expect(server(without)).toBe(false);
    }
    expect(server({ ...room, players: [{ ...player(1, 0), team: 2 }] })).toBe(false);
    const { team: _team, ...teamless } = player(1, 0);
    expect(server({ ...room, players: [teamless] })).toBe(false);
    expect(server({ ...room, name: 'x'.repeat(25) })).toBe(false);
    expect(server({ ...room, name: 'Klasa\u00073B' })).toBe(false);
    expect(server({ ...room, mode: 'solo' })).toBe(false);
  });

  it('takes up to 8 players, 8 spectators and 8 votes or skips per room', () => {
    const players = (n: number) => Array.from({ length: n }, (_, i) => player(i + 1, i % 2));
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
    expect(server({ ...room, players: players(8) })).toBe(true);
    expect(server({ ...room, players: players(9) })).toBe(false);
    const spectators = (n: number) => Array.from({ length: n }, (_, i) => spectator(i + 10));
    expect(server({ ...room, spectators: spectators(8) })).toBe(true);
    expect(server({ ...room, spectators: spectators(9) })).toBe(false);
    const votes = (n: number) => ids(n).map((playerId) => ({ playerId, storyId: 'l2-story' }));
    expect(server({ ...room, phase: 'results', blunderVotes: votes(8) })).toBe(true);
    expect(server({ ...room, phase: 'results', blunderVotes: votes(9) })).toBe(false);
    const briefing = (n: number) => ({ endsInMs: 8000, skippedBy: ids(n) });
    expect(server({ ...room, phase: 'briefing', briefing: briefing(8) })).toBe(true);
    expect(server({ ...room, phase: 'briefing', briefing: briefing(9) })).toBe(false);
  });

  it('keeps one newsroom at 4 players in a snapshot, tagged with its team and scoreboard', () => {
    const snapshot = { type: 'snapshot', tick: 40, players: [], ...EMPTY_LEVEL };
    expect(server({ ...snapshot, team: 1 })).toBe(true);
    expect(server({ ...snapshot, team: 0, scoreboard: [teamScore(0), teamScore(1)] })).toBe(true);
    expect(server({ ...snapshot, team: 2 })).toBe(false);
    const three = [teamScore(0), teamScore(1), teamScore(1)];
    expect(server({ ...snapshot, scoreboard: three })).toBe(false);
    expect(server({ ...snapshot, scoreboard: [{ ...teamScore(0), connected: 5 }] })).toBe(false);
    expect(server({ ...snapshot, scoreboard: [{ ...teamScore(0), resolved: -1 }] })).toBe(false);
    const event = { type: 'event', tick: 3, event: { kind: 'gameStarted' } };
    expect(server({ ...event, team: 1 })).toBe(true);
    expect(server({ ...event, team: 2 })).toBe(false);
  });

  it('sends spectators game events and the embargo kinds, tagged with a team', () => {
    const feed = (team: unknown, event: unknown) =>
      server({ type: 'spectatorEvent', tick: 80, team, event });
    const masked = {
      kind: 'verdictMasked',
      playerId: 'p2',
      folderId: 'f3',
      spawnKey: 's2',
      closedBy: 'verdict',
    };
    expect(feed(0, { kind: 'stampApplied', ...stampFields })).toBe(true);
    expect(feed(1, masked)).toBe(true);
    expect(feed(0, { ...masked, playerId: null, closedBy: 'expired' })).toBe(true);
    expect(feed(0, { kind: 'verdictRevealed', result: { ...result, playerId: 'p2' } })).toBe(true);
    expect(feed(0, { kind: 'verdictRevealed', result: { ...result, playerId: null } })).toBe(true);
    expect(feed(0, { kind: 'verdictRevealed', result })).toBe(false);
    expect(feed(2, masked)).toBe(false);
    expect(feed(0, { ...masked, closedBy: 'raid' })).toBe(false);
    expect(server({ type: 'spectatorEvent', tick: 80, event: masked })).toBe(false);
    // A spectator event is not a player event.
    expect(server({ type: 'event', tick: 80, event: masked })).toBe(false);
  });

  it('lets verdictMasked carry no verdict, outcome, reason or points', () => {
    expect(Object.keys(verdictMaskedEventSchema.shape).sort()).toEqual([
      'closedBy',
      'folderId',
      'kind',
      'playerId',
      'spawnKey',
    ]);
    const masked = {
      kind: 'verdictMasked',
      playerId: 'p2',
      folderId: 'f3',
      spawnKey: 's2',
      closedBy: 'verdict',
    };
    const feed = (event: unknown) => server({ type: 'spectatorEvent', tick: 80, team: 0, event });
    for (const leak of [
      { verdict: 'reject' },
      { outcome: 'correct' },
      { reason: 'correctNormal' },
      { scoreDelta: 25 },
      { credibilityDelta: -10 },
      { bonuses: { speed: 5, multiStamp: 0, bossCall: 0 } },
    ]) {
      expect(feed({ ...masked, ...leak })).toBe(false);
    }
  });

  it('sends spectators live match stats for up to 8 players and 2 teams', () => {
    const message = {
      type: 'matchStats',
      tick: 200,
      players: [stats(1, 0), stats(2, 1)],
      teams: [teamScore(0), teamScore(1)],
    };
    expect(server(message)).toBe(true);
    const nine = Array.from({ length: 9 }, (_, i) => stats(i + 1, i % 2));
    expect(server({ ...message, players: nine })).toBe(false);
    expect(server({ ...message, teams: [] })).toBe(false);
    expect(server({ ...message, players: [{ ...stats(1, 0), wrong: -1 }] })).toBe(false);
    expect(server({ ...message, players: [{ ...stats(1, 0), team: 2 }] })).toBe(false);
  });

  it('ends a versus match per team with the winner, both scores, rival results and stats', () => {
    const end = {
      type: 'levelEnd',
      levelId: 'l2-wybory',
      difficulty: 'normal',
      won: false,
      stars: 1,
      score: 95,
      credibility: 60,
      results: [{ ...result, spawnKey: 's2', scoreDelta: -20, outcome: 'wrong' }],
      lossReason: null,
      starThresholds: { two: 150, three: 220 },
      maxScore: 280,
      team: 1,
      stats: [stats(1, 0), stats(2, 1)],
      versus: {
        winnerTeam: 0,
        reason: 'score',
        teams: [teamScore(0), teamScore(1)],
        rivalResults: [result],
      },
    };
    expect(server(end)).toBe(true);
    expect(server({ ...end, versus: { ...end.versus, winnerTeam: null, reason: 'draw' } })).toBe(
      true,
    );
    for (const reason of ['credibility', 'forfeit']) {
      expect(server({ ...end, versus: { ...end.versus, reason } })).toBe(true);
    }
    expect(server({ ...end, versus: { ...end.versus, reason: 'timeout' } })).toBe(false);
    expect(server({ ...end, versus: { ...end.versus, winnerTeam: 2 } })).toBe(false);
    expect(server({ ...end, versus: { ...end.versus, teams: [teamScore(0)] } })).toBe(false);
    const { spawnKey: _key, ...keyless } = result;
    expect(server({ ...end, versus: { ...end.versus, rivalResults: [keyless] } })).toBe(false);
    expect(server({ ...end, team: 2 })).toBe(false);
    // A co-op levelEnd stays valid without the new fields.
    const { team: _team, stats: _stats, versus: _versus, ...coop } = end;
    expect(server(coop)).toBe(true);
  });

  it('knows the room error codes', () => {
    for (const code of [
      'teamFull',
      'spectatorsFull',
      'spectatorsOff',
      'matchInProgress',
      'teamEmpty',
      'kicked',
      'kickCooldown',
      'invalidTarget',
      'invalidName',
      'featureDisabled',
    ]) {
      expect(server({ type: 'error', code })).toBe(true);
    }
  });
});
