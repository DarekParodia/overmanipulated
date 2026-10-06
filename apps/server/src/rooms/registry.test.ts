import { beforeEach, describe, expect, it } from 'bun:test';
import { PROTOCOL_VERSION, RECONNECT_GRACE_MS, TICK_MS } from '@redakcja/shared';
import { createFakeHub, type FakeConnection } from '../__fixtures__/fake-transport.ts';
import { generateRoomCode } from './codes.ts';
import { createRoomRegistry, type RoomRegistry } from './registry.ts';

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

    registry.handleMessage(host, { type: 'lobby', action: { kind: 'start' } });
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
    registry.handleMessage(host, { type: 'lobby', action: { kind: 'start' } });
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

  it('ignores input while in the lobby', () => {
    const host = join('Ala');
    input(host, 0, 1, 0);
    expect(registry.inspect(welcomeOf(host).roomCode)?.players[0]?.queued).toBe(0);
  });
});

describe('disconnects and reconnects', () => {
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
