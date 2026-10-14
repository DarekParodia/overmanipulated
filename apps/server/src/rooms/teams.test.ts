// The registry's members, newsrooms and topics (S7-79): co-op plays in team 0 on room:CODE:t0,
// one context and one sim seed per match, one member per reconnect token, stats per player.
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  BRIEFING_DURATION_MS,
  type FolderResult,
  type GameEvent,
  type MemberKind,
  type ServerMessage,
  TICK_MS,
} from '@redakcja/shared';
import type { FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomHarness } from '../__fixtures__/room-helpers.ts';
import type { Connection } from './connection.ts';
import { pickTeam, roomTopics, syncTopics, topicsFor } from './registry.ts';

const RESULT: FolderResult = {
  folderId: 'f1',
  spawnKey: 's0',
  storyId: 's1',
  outcome: 'correct',
  reason: 'correctImportant',
  verdict: 'publish',
  scoreDelta: 100,
  credibilityDelta: 5,
  justifyingStampIds: ['s1-image'],
  requiredStamps: 1,
  bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
  missedStampIds: [],
};

let room: ReturnType<typeof createRoomHarness>;

beforeEach(() => {
  room = createRoomHarness({ random: () => 0.25 });
});

function codeOf(connection: FakeConnection): string {
  return room.welcomeOf(connection).roomCode;
}

function types(messages: ServerMessage[]): string[] {
  return [...new Set(messages.map((m) => m.type))].sort();
}

describe('co-op on the team topic', () => {
  it('subscribes a co-op player to room:CODE and room:CODE:t0', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const guest = room.join('Bartek', { code });
    const topics = room.registry.inspect(code)?.topics;
    expect(topics).toEqual({
      [room.welcomeOf(host).playerId]: [`room:${code}`, `room:${code}:t0`],
      [room.welcomeOf(guest).playerId]: [`room:${code}`, `room:${code}:t0`],
    });
  });

  it('sends team-0 snapshots and events on room:CODE:t0 to a co-op player', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const guest = room.join('Bartek', { code });
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    room.ticks(3);
    expect(guest.all('snapshot')).toHaveLength(3);

    const snapshots = host.all('snapshot');
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((s) => [s.tick, s.team])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(snapshots[2]).toMatchObject({ elapsedMs: 3 * TICK_MS, paused: false });
    expect(snapshots[2]?.scoreboard).toBeUndefined();

    const teamTopic = room.onTopic(`room:${code}:t0`);
    expect(teamTopic.filter((m) => m.type === 'snapshot')).toHaveLength(3);
    // The room topic keeps only what every member needs; no spectator ever got anything.
    expect(types(room.onTopic(`room:${code}`))).toEqual(['event', 'roomState']);
    expect(room.onTopic(`room:${code}`).filter((m) => m.type === 'event')).toEqual([
      { type: 'event', tick: 0, event: { kind: 'gameStarted' } },
    ]);
    expect(room.onTopic(`room:${code}:spec`)).toEqual([]);
    expect(room.onTopic(`room:${code}:t1`)).toEqual([]);
  });

  it('tags team events with team 0 on the team topic', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const guest = room.join('Bartek', { code });
    expect(host.last('event')).toEqual({
      type: 'event',
      tick: 0,
      team: 0,
      event: { kind: 'playerJoined', playerId: room.welcomeOf(guest).playerId },
    });
    expect(room.onTopic(`room:${code}:t0`)).toHaveLength(1);
  });

  it('sends levelEnd on the team topic with the co-op fields only', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    room.startPastBriefing(host);
    room.forceStep(code, 0, (result) => ({
      ...result,
      state: {
        ...result.state,
        score: 340,
        results: [RESULT],
        ended: { won: true, stars: 2, lossReason: null },
      },
    }));
    room.ticks(1);
    const end = room.onTopic(`room:${code}:t0`).filter((m) => m.type === 'levelEnd');
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ won: true, stars: 2, score: 340, results: [RESULT] });
    expect(end[0]).not.toHaveProperty('team');
    expect(end[0]).not.toHaveProperty('stats');
    expect(host.last('levelEnd')).toEqual(end[0]);
    expect(room.registry.inspect(code)?.phase).toBe('results');
  });

  it('sends the paused snapshot to the team topic', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    room.startPastBriefing(host);
    room.lobby(host, { kind: 'setPaused', paused: true });
    expect(room.onTopic(`room:${code}:t0`).at(-1)).toMatchObject({
      type: 'snapshot',
      team: 0,
      paused: true,
    });
  });
});

describe('newsrooms of a match', () => {
  it('keeps inspect().game as the alias of team 0 and plays one seed per match', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    expect(room.registry.inspect(code)?.games).toHaveLength(1);
    room.startPastBriefing(host);
    const view = room.registry.inspect(code);
    expect(view?.game).toBe(view?.games[0]);
    // floor(0.25 × 0x7fffffff): the run seed and the sim seed are separate draws of it.
    expect(view?.game.seed).toBe(536_870_911);
    expect(view?.run?.seed).toBe(536_870_911);
    expect(view?.forfeited).toEqual([false]);
    expect(view?.outcome).toBeNull();
    expect(view?.embargo).toEqual({ teams: 1, open: {}, closed: {}, held: [] });
  });

  it('draws the sim seed at the level start, apart from the run seed of the briefing', () => {
    // Each draw returns the next tenth, so a seed shows which draw it came from.
    let draws = 0;
    const counted = createRoomHarness({ random: () => (draws++ % 10) / 10 });
    const host = counted.join('Ala');
    const code = counted.welcomeOf(host).roomCode;
    const afterCreate = draws;
    counted.lobby(host, { kind: 'start' });
    expect(draws - afterCreate).toBe(1);
    const runSeed = counted.registry.inspect(code)?.run?.seed;
    counted.clock.time += BRIEFING_DURATION_MS;
    counted.ticks(1);
    expect(draws - afterCreate).toBe(2);
    const view = counted.registry.inspect(code);
    expect(view?.phase).toBe('playing');
    expect(view?.run?.seed).toBe(runSeed);
    // Four draws make the room code; the briefing's run seed is the 5th (0.4 × 0x7fffffff), the
    // level start's sim seed the 6th (0.5 × 0x7fffffff).
    expect([afterCreate, runSeed, view?.game.seed]).toEqual([4, 858_993_458, 1_073_741_823]);
  });

  it('records the creation time from the wall clock', () => {
    room.clock.time = 42;
    const host = room.join('Ala');
    expect(room.registry.inspect(codeOf(host))?.createdAt).toBe(1_700_000_000_042);
  });

  it("folds every step's events into the players' match stats", () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const late = room.join('Bartek', { code });
    const hostId = room.welcomeOf(host).playerId;
    const lateId = room.welcomeOf(late).playerId;
    room.lobby(late, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    const extra: GameEvent[] = [
      { ...RESULT, kind: 'verdictResult', playerId: hostId, verdict: 'publish' },
      {
        kind: 'stampApplied',
        stationId: 'st1',
        playerId: lateId,
        folderId: 'f1',
        stampId: 's1-image',
        via: 'minigame',
      },
      { kind: 'minigameFailed', stationId: 'st1', playerId: lateId, folderId: 'f1', lockoutMs: 0 },
    ];
    room.forceStep(code, 0, (result) => ({ ...result, events: [...result.events, ...extra] }));
    room.ticks(1);
    expect(room.registry.inspect(code)?.stats).toEqual([
      {
        playerId: hostId,
        team: 0,
        verdicts: 1,
        correct: 1,
        wrong: 0,
        stamps: 0,
        minigameFails: 0,
        abilities: 0,
      },
      {
        playerId: lateId,
        team: 0,
        verdicts: 0,
        correct: 0,
        wrong: 0,
        stamps: 1,
        minigameFails: 1,
        abilities: 0,
      },
    ]);
  });

  it('gives a mid-level joiner a place in team 0, its sim and the stats', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    room.startPastBriefing(host);
    const late = room.join('Celina', { code });
    const lateId = room.welcomeOf(late).playerId;
    const view = room.registry.inspect(code);
    expect(view?.players.map((p) => [p.nickname, p.team, p.colorIndex])).toEqual([
      ['Ala', 0, 0],
      ['Celina', 0, 1],
    ]);
    expect(view?.game.players[lateId]).toBeDefined();
    expect(view?.stats.map((s) => s.playerId)).toEqual([room.welcomeOf(host).playerId, lateId]);
    room.ticks(1);
    expect(late.last('snapshot')?.team).toBe(0);
  });
});

describe('members', () => {
  it('keeps the browser id of each member', () => {
    const host = room.join('Ala', { clientId: 'a'.repeat(16) });
    room.join('Bartek', { code: codeOf(host) });
    expect(room.registry.inspect(codeOf(host))?.players.map((p) => p.clientId)).toEqual([
      'a'.repeat(16),
      null,
    ]);
  });

  it('resumes the one member a token belongs to, whatever kind the join asks for', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const guest = room.join('Bartek', { code });
    const { playerId, reconnectToken } = room.welcomeOf(guest);
    room.registry.handleDisconnect(guest, false);

    const back = room.join('Bartek', { as: 'spectator', token: reconnectToken });
    expect(back.last('error')).toBeUndefined();
    expect(room.welcomeOf(back).playerId).toBe(playerId);
    const view = room.registry.inspect(code);
    expect(view?.players.map((p) => [p.id, p.connected])).toEqual([
      [room.welcomeOf(host).playerId, true],
      [playerId, true],
    ]);
    expect(view?.spectators).toEqual([]);
    expect(view?.topics[playerId]).toEqual([`room:${code}`, `room:${code}:t0`]);
  });

  it('moves a replaced socket off every topic of the member', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const { reconnectToken } = room.welcomeOf(host);
    const second = room.join('Ala', { token: reconnectToken });
    expect(host.closed).toEqual({ code: 4001, reason: 'replaced' });
    room.startPastBriefing(second);
    room.ticks(1);
    expect(host.all('snapshot')).toHaveLength(0);
    expect(second.all('snapshot')).toHaveLength(1);
    expect(room.onTopic(`room:${code}:t0`).length).toBeGreaterThan(0);
  });
});

describe('team and topic rules', () => {
  const players = (...teams: number[]) =>
    new Map<string, { kind: MemberKind; team: number }>(
      teams.map((team, i) => [`p${i + 1}`, { kind: 'player', team }]),
    );

  it('picks team 0 in co-op until four players, then none', () => {
    expect(pickTeam({ mode: 'coop', members: players() })).toBe(0);
    expect(pickTeam({ mode: 'coop', members: players(0, 0, 0) })).toBe(0);
    expect(pickTeam({ mode: 'coop', members: players(0, 0, 0, 0) })).toBeNull();
  });

  it('picks the smaller versus team, team 0 on a tie, none when both are full', () => {
    expect(pickTeam({ mode: 'versus', members: players() })).toBe(0);
    expect(pickTeam({ mode: 'versus', members: players(0) })).toBe(1);
    expect(pickTeam({ mode: 'versus', members: players(0, 1, 0) })).toBe(1);
    expect(pickTeam({ mode: 'versus', members: players(0, 0, 0, 0, 1, 1, 1) })).toBe(1);
    expect(pickTeam({ mode: 'versus', members: players(0, 0, 0, 0, 1, 1, 1, 1) })).toBeNull();
    const withSpectator = players(0);
    withSpectator.set('p9', { kind: 'spectator', team: 0 });
    expect(pickTeam({ mode: 'versus', members: withSpectator })).toBe(1);
  });

  it('lists a player on its team topic and a spectator on the Widownia topic', () => {
    expect(topicsFor('ABCD', { kind: 'player', team: 1 })).toEqual(['room:ABCD', 'room:ABCD:t1']);
    expect(topicsFor('ABCD', { kind: 'spectator', team: 1 })).toEqual([
      'room:ABCD',
      'room:ABCD:spec',
    ]);
    expect([
      roomTopics.room('ABCD'),
      roomTopics.team('ABCD', 0),
      roomTopics.spectators('ABCD'),
    ]).toEqual(['room:ABCD', 'room:ABCD:t0', 'room:ABCD:spec']);
  });

  it('moves subscriptions to the topics of a new kind or team', () => {
    const calls: string[] = [];
    const connection: Connection = {
      id: 'c1',
      send: () => {},
      subscribe: (topic) => calls.push(`+${topic}`),
      unsubscribe: (topic) => calls.push(`-${topic}`),
      close: () => {},
    };
    const member = { kind: 'player' as const, team: 1, connection };
    syncTopics('ABCD', member, topicsFor('ABCD', { kind: 'player', team: 0 }));
    expect(calls).toEqual(['-room:ABCD:t0', '+room:ABCD:t1']);
    calls.length = 0;
    syncTopics('ABCD', { ...member, kind: 'spectator' }, topicsFor('ABCD', member));
    expect(calls).toEqual(['-room:ABCD:t1', '+room:ABCD:spec']);
    calls.length = 0;
    syncTopics('ABCD', { ...member, connection: null }, []);
    expect(calls).toEqual([]);
  });
});
