import { beforeEach, describe, expect, it } from 'bun:test';
import { DEFAULT_LEVEL_ID, getLevel } from '@redakcja/content';
import {
  BRIEFING_DURATION_MS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  TICK_MS,
} from '@redakcja/shared';
import { createFakeHub, type FakeConnection } from '../__fixtures__/fake-transport.ts';
import { generateRoomCode } from './codes.ts';
import { absentPlayerIds, createRoomRegistry, type RoomRegistry } from './registry.ts';

let time = 0;
let fake: ReturnType<typeof createFakeHub>;
let registry: RoomRegistry;
let activations = 0;

beforeEach(() => {
  time = 0;
  activations = 0;
  fake = createFakeHub();
  registry = createRoomRegistry({
    hub: fake.hub,
    now: () => time,
    onActive: () => {
      activations++;
    },
  });
});

function join(nickname: string, roomCode?: string, reconnectToken?: string): FakeConnection {
  const connection = fake.connect();
  registry.handleMessage(connection, {
    type: 'join',
    protocolVersion: PROTOCOL_VERSION,
    nickname,
    ...(roomCode === undefined ? {} : { roomCode }),
    ...(reconnectToken === undefined ? {} : { reconnectToken }),
  });
  return connection;
}

function welcomeOf(connection: FakeConnection) {
  const welcome = connection.last('welcome');
  if (!welcome) {
    throw new Error('no welcome received');
  }
  return welcome;
}

/** Host presses start and the briefing runs out, so the level is playing. */
function startPastBriefing(host: FakeConnection): void {
  registry.handleMessage(host, { type: 'lobby', action: { kind: 'start' } });
  time += BRIEFING_DURATION_MS;
  registry.tick();
}

function input(connection: FakeConnection, seq: number, x: number, y: number) {
  registry.handleMessage(connection, {
    type: 'input',
    seq,
    move: { x, y },
    actions: { interact: false, work: false },
  });
}

describe('creating and joining rooms', () => {
  it('creates a room with the creator as host', () => {
    const host = join('Ala');
    const welcome = welcomeOf(host);
    expect(welcome.roomCode).toMatch(/^[A-Z]{4}$/);
    expect(host.last('roomState')).toMatchObject({ hostId: welcome.playerId, phase: 'lobby' });
    expect(registry.roomCount).toBe(1);
    expect(activations).toBe(1);
  });

  it('lets others join by code and tells everyone', () => {
    const host = join('Ala');
    const code = welcomeOf(host).roomCode;
    const guest = join('Bartek', code);
    expect(welcomeOf(guest).roomCode).toBe(code);
    const state = host.last('roomState');
    expect(state?.players.map((p) => p.nickname)).toEqual(['Ala', 'Bartek']);
    expect(state?.players.map((p) => p.colorIndex)).toEqual([0, 1]);
    expect(host.last('event')?.event).toEqual({
      kind: 'playerJoined',
      playerId: welcomeOf(guest).playerId,
    });
  });

  it('rejects unknown codes, full rooms and protocol mismatches', () => {
    expect(join('Ala', 'ZZZZ').last('error')?.code).toBe('roomNotFound');
    const code = welcomeOf(join('A')).roomCode;
    join('B', code);
    join('C', code);
    join('D', code);
    expect(join('E', code).last('error')?.code).toBe('roomFull');

    const connection = fake.connect();
    registry.handleMessage(connection, { type: 'join', protocolVersion: 999, nickname: 'X' });
    expect(connection.last('error')?.code).toBe('protocolMismatch');
  });

  it('rejects a second join on the same connection', () => {
    const host = join('Ala');
    registry.handleMessage(host, {
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname: 'B',
    });
    expect(host.last('error')?.code).toBe('invalidMessage');
  });

  it('reuses a freed colour slot', () => {
    const host = join('A');
    const code = welcomeOf(host).roomCode;
    const b = join('B', code);
    join('C', code);
    registry.handleDisconnect(b, true);
    const d = join('D', code);
    const colours = host.last('roomState')?.players.find((p) => p.id === welcomeOf(d).playerId);
    expect(colours?.colorIndex).toBe(1);
  });
});

describe('starting the game', () => {
  it('only the host can start; start spawns everyone', () => {
    const host = join('Ala');
    const guest = join('Bartek', welcomeOf(host).roomCode);
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'start' } });
    expect(guest.last('error')?.code).toBe('notHost');

    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    startPastBriefing(host);
    expect(host.last('roomState')?.phase).toBe('playing');
    expect(guest.all('event').map((e) => e.event.kind)).toContain('gameStarted');
    const game = registry.inspect(welcomeOf(host).roomCode)?.game;
    expect(Object.keys(game?.players ?? {})).toHaveLength(2);
  });

  it('stores roles, readiness and the selected level in the room state', () => {
    const host = join('Ala');
    const guest = join('Bartek', welcomeOf(host).roomCode);
    registry.handleMessage(guest, {
      type: 'lobby',
      action: { kind: 'setRole', role: 'archivist' },
    });
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    const players = host.last('roomState')?.players;
    expect(players?.[1]).toMatchObject({ role: 'archivist', ready: true });
    expect(host.last('roomState')?.levelId).toBe('l0-greybox');

    registry.handleMessage(guest, {
      type: 'lobby',
      action: { kind: 'selectLevel', levelId: 'l0-greybox' },
    });
    expect(guest.last('error')?.code).toBe('notHost');
    registry.handleMessage(host, {
      type: 'lobby',
      action: { kind: 'selectLevel', levelId: 'l9-nope' },
    });
    expect(host.last('error')?.code).toBe('unknownLevel');
  });

  it('rejects lobby and input messages before joining', () => {
    const stranger = fake.connect();
    registry.handleMessage(stranger, { type: 'lobby', action: { kind: 'start' } });
    expect(stranger.last('error')?.code).toBe('notInRoom');
  });
});

describe('ticks and snapshots', () => {
  function startedRoom() {
    const host = join('Ala');
    const guest = join('Bartek', welcomeOf(host).roomCode);
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    startPastBriefing(host);
    return { host, guest, code: welcomeOf(host).roomCode };
  }

  it('moves players by their queued inputs and acknowledges the sequence', () => {
    const { host, guest } = startedRoom();
    const before = registry.inspect(welcomeOf(host).roomCode)?.game.players[
      welcomeOf(host).playerId
    ];
    for (let seq = 0; seq < 10; seq++) {
      input(host, seq, 1, 0);
      registry.tick();
    }
    const snapshot = guest.last('snapshot');
    const me = snapshot?.players.find((p) => p.id === welcomeOf(host).playerId);
    expect(snapshot?.tick).toBe(10);
    expect(me?.lastInputSeq).toBe(9);
    expect(me?.x).toBeCloseTo((before?.x ?? 0) + (4.5 * 10 * TICK_MS) / 1000, 2);
  });

  it('applies one input per tick and catches up when the queue grows', () => {
    const { host, code } = startedRoom();
    for (let seq = 0; seq < 6; seq++) {
      input(host, seq, 1, 0);
    }
    registry.tick();
    expect(registry.inspect(code)?.players[0]?.queued).toBe(4);
    registry.tick();
    expect(registry.inspect(code)?.players[0]?.queued).toBe(2);
    registry.tick();
    expect(registry.inspect(code)?.players[0]?.queued).toBe(1);
  });

  it('ignores stale or duplicate sequence numbers', () => {
    const { host, code } = startedRoom();
    input(host, 5, 1, 0);
    input(host, 5, 1, 0);
    input(host, 3, 1, 0);
    expect(registry.inspect(code)?.players[0]?.queued).toBe(1);
  });

  it('sends level data in snapshots and turns commands into events next tick', () => {
    const { host, guest } = startedRoom();
    registry.handleMessage(host, { type: 'command', command: { kind: 'ping', ping: 'mine' } });
    registry.tick();
    const snapshot = guest.last('snapshot');
    expect(snapshot).toMatchObject({ score: 0, credibility: 100 });
    expect(snapshot?.stations.map((s) => s.kind)).toEqual([
      'imageSearch',
      'archive',
      'sourceRegistry',
    ]);
    expect(guest.all('event').map((e) => e.event)).toContainEqual({
      kind: 'ping',
      playerId: welcomeOf(host).playerId,
      ping: 'mine',
    });
  });

  it('carries every player’s ability state in snapshots, in join order (S7-36)', () => {
    const host = join('Ala');
    const guest = join('Bartek', welcomeOf(host).roomCode);
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    startPastBriefing(host);
    registry.tick();
    const idle = { abilityReadyAtMs: 0, abilityArmed: false, fieldCall: null, rescuesLeft: 0 };
    expect(guest.last('snapshot')?.crew).toEqual([
      { id: welcomeOf(host).playerId, ...idle },
      { id: welcomeOf(guest).playerId, ...idle },
    ]);
  });

  it('resolves useAbility next tick and reports the cooldown in crew (S7-37)', () => {
    // A fixed run seed: this run deals an important story first (75 s on Normal).
    registry = createRoomRegistry({ hub: fake.hub, now: () => time, random: () => 0.9 });
    const host = join('Ala');
    const hostId = welcomeOf(host).playerId;
    registry.handleMessage(host, {
      type: 'lobby',
      action: { kind: 'setRole', role: 'managingEditor' },
    });
    startPastBriefing(host);
    for (let i = 0; i < 60; i++) {
      registry.tick();
    }
    const before = host.last('snapshot');
    expect(before?.elapsedMs).toBe(3000);
    expect(before?.folders.map((f) => [f.id, f.spawnedAtMs, f.deadlineMs])).toEqual([
      ['f1', 3000, 78_000],
    ]);
    registry.handleMessage(host, { type: 'command', command: { kind: 'useAbility' } });
    registry.tick();
    expect(host.all('event').map((e) => e.event)).toContainEqual({
      kind: 'ability',
      playerId: hostId,
      ability: 'extendDeadline',
      stage: 'done',
      folderId: 'f1',
      addedMs: 20_000,
    });
    const after = host.last('snapshot');
    expect(after?.folders[0]).toMatchObject({ id: 'f1', deadlineMs: 98_000, extendedMs: 20_000 });
    expect(after?.crew[0]).toMatchObject({
      id: hostId,
      abilityReadyAtMs: (after?.elapsedMs ?? 0) + 60_000,
    });
    // A second press within the cooldown is ignored without an event.
    const abilityEvents = () => host.all('event').filter((e) => e.event.kind === 'ability');
    registry.handleMessage(host, { type: 'command', command: { kind: 'useAbility' } });
    registry.tick();
    expect(abilityEvents()).toHaveLength(1);
    expect(host.last('snapshot')?.folders[0]?.deadlineMs).toBe(98_000);
  });

  it('announces the next scheduled folder in every snapshot, from the first one on', () => {
    const { guest } = startedRoom();
    // The default level, l0-greybox, deals its first folder at 3 s and the second at 25 s.
    const firstTwo = getLevel(DEFAULT_LEVEL_ID)?.schedule.slice(0, 2);
    expect(firstTwo?.map((entry) => entry.atS)).toEqual([3, 25]);
    registry.tick();
    expect(guest.all('snapshot')).toHaveLength(1);
    expect(guest.last('snapshot')).toMatchObject({
      tick: 1,
      nextFolder: { atMs: 3000, sinceMs: 0 },
      conveyorFull: false,
    });
    while ((guest.last('snapshot')?.elapsedMs ?? 0) < 3000) {
      registry.tick();
    }
    expect(guest.last('snapshot')?.folders).toHaveLength(1);
    expect(guest.last('snapshot')).toMatchObject({
      nextFolder: { atMs: 25_000, sinceMs: 3000 },
      conveyorFull: false,
    });
  });

  it('ignores input while in the lobby', () => {
    const host = join('Ala');
    input(host, 0, 1, 0);
    expect(registry.inspect(welcomeOf(host).roomCode)?.players[0]?.queued).toBe(0);
  });
});

describe('pausing from the in-game menu (S7-10)', () => {
  function pause(connection: FakeConnection, paused: boolean): void {
    registry.handleMessage(connection, { type: 'lobby', action: { kind: 'setPaused', paused } });
  }

  function soloRoom() {
    const host = join('Ala');
    startPastBriefing(host);
    const code = welcomeOf(host).roomCode;
    registry.tick();
    registry.tick();
    return { host, code };
  }

  it('freezes a solo level while paused and resumes where it stopped', () => {
    const { host, code } = soloRoom();
    expect(registry.inspect(code)?.game.elapsedMs).toBe(2 * TICK_MS);
    pause(host, true);
    expect(registry.inspect(code)?.paused).toBe(true);
    expect(host.last('snapshot')).toMatchObject({ elapsedMs: 100, paused: true });
    const snapshots = host.all('snapshot').length;
    for (let i = 0; i < 40; i++) {
      input(host, i, 1, 0);
      registry.tick();
    }
    expect(registry.inspect(code)?.game.elapsedMs).toBe(100);
    expect(registry.inspect(code)?.game.tick).toBe(2);
    // Nothing is sent and no input waits for the resume.
    expect(host.all('snapshot')).toHaveLength(snapshots);
    expect(registry.inspect(code)?.players[0]?.queued).toBe(0);

    pause(host, false);
    registry.tick();
    expect(registry.inspect(code)?.game.elapsedMs).toBe(150);
    expect(host.last('snapshot')).toMatchObject({ elapsedMs: 150, paused: false });
  });

  it('is cleared when a second player joins, and then refused', () => {
    const { host, code } = soloRoom();
    pause(host, true);
    const guest = join('Bartek', code);
    expect(registry.inspect(code)?.paused).toBe(false);
    registry.tick();
    expect(registry.inspect(code)?.game.elapsedMs).toBe(150);
    expect(guest.last('snapshot')).toMatchObject({ paused: false });

    pause(host, true);
    pause(guest, true);
    registry.tick();
    expect(registry.inspect(code)?.paused).toBe(false);
    expect(registry.inspect(code)?.game.elapsedMs).toBe(200);
  });

  it('refuses a pause in a two-player room and outside the playing phase', () => {
    const host = join('Ala');
    const code = welcomeOf(host).roomCode;
    pause(host, true);
    expect(registry.inspect(code)?.paused).toBe(false);

    const guest = join('Bartek', code);
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    startPastBriefing(host);
    pause(host, true);
    registry.tick();
    expect(registry.inspect(code)?.paused).toBe(false);
    expect(registry.inspect(code)?.game.elapsedMs).toBe(50);
    expect(host.last('snapshot')).toMatchObject({ paused: false });
  });

  it('lets the last connected player pause while a teammate is away, until they return', () => {
    const { host, code } = soloRoom();
    const guest = join('Bartek', code);
    const { reconnectToken } = welcomeOf(guest);
    registry.handleDisconnect(guest, false);
    pause(host, true);
    expect(registry.inspect(code)?.paused).toBe(true);
    join('Bartek', undefined, reconnectToken);
    expect(registry.inspect(code)?.paused).toBe(false);
  });

  it('clears the pause when the solo player reloads (the menu comes back closed)', () => {
    const { host, code } = soloRoom();
    const { reconnectToken } = welcomeOf(host);
    pause(host, true);
    registry.handleDisconnect(host, false);
    expect(registry.inspect(code)?.paused).toBe(true);
    join('Ala', undefined, reconnectToken);
    expect(registry.inspect(code)?.paused).toBe(false);
  });
});

describe('disconnects and reconnects', () => {
  it('lists the dropped players as absent for Podaj teczkę (S7-38)', () => {
    const connected = { id: 'p1', connection: {} };
    expect(absentPlayerIds([connected, { id: 'p2', connection: {} }])).toBeUndefined();
    expect(absentPlayerIds([connected, { id: 'p2', connection: null }])).toEqual(new Set(['p2']));
  });

  it('keeps the slot for the grace period and restores it with the token', () => {
    const host = join('Ala');
    const { roomCode, reconnectToken, playerId } = welcomeOf(host);
    const guest = join('Bartek', roomCode);
    registry.handleDisconnect(host, false);
    expect(guest.last('roomState')?.players.find((p) => p.id === playerId)?.connected).toBe(false);
    expect(guest.last('roomState')?.hostId).toBe(welcomeOf(guest).playerId);

    time += RECONNECT_GRACE_MS - 1;
    registry.tick();
    const back = join('Ala', undefined, reconnectToken);
    expect(welcomeOf(back).playerId).toBe(playerId);
    expect(guest.last('roomState')?.players.find((p) => p.id === playerId)?.connected).toBe(true);
    expect(guest.last('event')?.event.kind).toBe('playerReconnected');
  });

  it('frees the slot after the grace period', () => {
    const host = join('Ala');
    const { roomCode, reconnectToken } = welcomeOf(host);
    const guest = join('Bartek', roomCode);
    registry.handleDisconnect(host, false);
    time += RECONNECT_GRACE_MS;
    registry.tick();
    expect(guest.last('roomState')?.players).toHaveLength(1);
    expect(join('Ala', undefined, reconnectToken).last('error')?.code).toBe('reconnectFailed');
  });

  it('removes a player immediately on an intentional leave', () => {
    const host = join('Ala');
    const guest = join('Bartek', welcomeOf(host).roomCode);
    registry.handleDisconnect(guest, true);
    expect(host.last('roomState')?.players).toHaveLength(1);
    expect(host.last('event')?.event.kind).toBe('playerLeft');
  });

  it('closes the room when the last player is gone', () => {
    const host = join('Ala');
    registry.handleDisconnect(host, false);
    time += RECONNECT_GRACE_MS;
    registry.tick();
    expect(registry.roomCount).toBe(0);
  });

  it('replaces an older socket when the same player reconnects twice', () => {
    const host = join('Ala');
    const { reconnectToken } = welcomeOf(host);
    const second = join('Ala', undefined, reconnectToken);
    expect(host.closed?.reason).toBe('replaced');
    expect(welcomeOf(second).playerId).toBe(welcomeOf(host).playerId);
    // The old socket's close must not mark the player as disconnected.
    registry.handleDisconnect(host, false);
    expect(registry.inspect(welcomeOf(host).roomCode)?.players[0]?.connected).toBe(true);
  });

  it('rejects an unknown reconnect token', () => {
    expect(join('Ala', undefined, 'f'.repeat(48)).last('error')?.code).toBe('reconnectFailed');
  });
});

describe('room codes', () => {
  it('avoids taken codes and uses only the safe alphabet', () => {
    let i = 0;
    const sequence = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const random = () => sequence[i++ % sequence.length] ?? 0;
    expect(generateRoomCode(random, new Set(['AAAA']))).toBe('NNNN');
  });
});
