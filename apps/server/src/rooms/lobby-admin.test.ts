// Lobby administration on the server (S7-82): visibility and room name, kick with the per-browser
// rejoin cooldown, and host transfer. Every action is host-only; a guest gets `notHost`.
import { beforeEach, describe, expect, it } from 'bun:test';
import { DEFAULT_DIFFICULTY, DEFAULT_FEATURE_FLAGS, type LobbyAction } from '@redakcja/shared';
import type { FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomHarness } from '../__fixtures__/room-helpers.ts';

const HOST_CLIENT = 'host-browser-0001';
const GUEST_CLIENT = 'guest-browser-002';
const TEN_MINUTES_MS = 600_000;

let room: ReturnType<typeof createRoomHarness>;
let roomBrowserFlag = true;

beforeEach(() => {
  roomBrowserFlag = true;
  room = createRoomHarness({
    random: () => 0.25,
    settings: () => ({
      maxRooms: 10,
      features: { ...DEFAULT_FEATURE_FLAGS, roomBrowser: roomBrowserFlag, spectators: true },
      defaultDifficulty: DEFAULT_DIFFICULTY,
    }),
  });
});

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${what} missing`);
  }
  return value;
}

function view(code: string) {
  return must(room.registry.inspect(code), `room ${code}`);
}

function lastError(connection: FakeConnection) {
  return connection.last('error')?.code;
}

/** Ala hosts, Bartek joins as a guest; both send a client id. */
function lobbyOfTwo() {
  const host = room.join('Ala', { clientId: HOST_CLIENT });
  const code = room.welcomeOf(host).roomCode;
  const guest = room.join('Bartek', { code, clientId: GUEST_CLIENT });
  return {
    host,
    guest,
    code,
    hostId: room.welcomeOf(host).playerId,
    guestId: room.welcomeOf(guest).playerId,
  };
}

describe('host-only room actions (S7-82)', () => {
  it('answers notHost to a guest and changes nothing', () => {
    const { guest, code, hostId, guestId } = lobbyOfTwo();
    const actions: LobbyAction[] = [
      { kind: 'setVisibility', visibility: 'public' },
      { kind: 'setRoomName', name: '3B piątek' },
      { kind: 'kick', playerId: hostId },
      { kind: 'transferHost', playerId: guestId },
    ];
    for (const action of actions) {
      const before = guest.all('error').length;
      room.lobby(guest, action);
      expect(
        guest
          .all('error')
          .slice(before)
          .map((e) => e.code),
      ).toEqual(['notHost']);
    }
    expect(view(code)).toMatchObject({ hostId, visibility: 'private', name: null });
    expect(view(code).players.map((p) => p.id)).toEqual([hostId, guestId]);
  });
});

describe('visibility and room name', () => {
  it('round-trips visibility in roomState, in any phase', () => {
    const { host, guest, code } = lobbyOfTwo();
    expect(host.last('roomState')?.visibility).toBe('private');
    room.lobby(host, { kind: 'setVisibility', visibility: 'public' });
    expect(guest.last('roomState')?.visibility).toBe('public');
    expect(view(code).visibility).toBe('public');
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    expect(view(code).phase).toBe('playing');
    room.lobby(host, { kind: 'setVisibility', visibility: 'private' });
    expect(guest.last('roomState')?.visibility).toBe('private');
  });

  it('answers featureDisabled for public while the room browser flag is off', () => {
    const { host, code } = lobbyOfTwo();
    roomBrowserFlag = false;
    room.lobby(host, { kind: 'setVisibility', visibility: 'public' });
    expect(lastError(host)).toBe('featureDisabled');
    expect(view(code).visibility).toBe('private');
    // Private is always allowed.
    const errors = host.all('error').length;
    room.lobby(host, { kind: 'setVisibility', visibility: 'private' });
    expect(host.all('error')).toHaveLength(errors);
  });

  it('round-trips the room name and clears it with null', () => {
    const { host, guest, code } = lobbyOfTwo();
    room.lobby(host, { kind: 'setRoomName', name: '3B piątek' });
    expect(guest.last('roomState')?.name).toBe('3B piątek');
    expect(view(code).name).toBe('3B piątek');
    room.lobby(host, { kind: 'setRoomName', name: null });
    expect(guest.last('roomState')?.name).toBeNull();
    expect(view(code).name).toBeNull();
  });

  it('answers invalidName to a blocklisted name and keeps the old one', () => {
    const { host, code } = lobbyOfTwo();
    room.lobby(host, { kind: 'setRoomName', name: 'Redakcja 2C' });
    const states = host.all('roomState').length;
    room.lobby(host, { kind: 'setRoomName', name: 'K.u.r.w.a 2C' });
    expect(lastError(host)).toBe('invalidName');
    expect(view(code).name).toBe('Redakcja 2C');
    expect(host.all('roomState')).toHaveLength(states);
  });
});

describe('kick', () => {
  it('sends kicked, removes the member, closes 4002 and invalidates the token', () => {
    const { host, guest, code, hostId, guestId } = lobbyOfTwo();
    const token = room.welcomeOf(guest).reconnectToken;
    room.lobby(host, { kind: 'kick', playerId: guestId });
    expect(guest.last('error')?.code).toBe('kicked');
    expect(guest.closed).toEqual({ code: 4002, reason: 'kicked' });
    expect(view(code).players.map((p) => p.id)).toEqual([hostId]);
    expect(host.last('roomState')?.players.map((p) => p.id)).toEqual([hostId]);
    // The kicked socket hears nothing more from the room.
    const received = guest.received.length;
    room.lobby(host, { kind: 'setRoomName', name: 'Bez Bartka' });
    expect(guest.received).toHaveLength(received);
    // The socket's close arrives afterwards and changes nothing.
    room.registry.handleDisconnect(guest, false);
    expect(view(code).players).toHaveLength(1);
    const back = room.join('Bartek', { token });
    expect(lastError(back)).toBe('reconnectFailed');
  });

  it('refuses a rejoin from the same browser for 10 minutes, then lets it in', () => {
    const { host, code, guestId } = lobbyOfTwo();
    room.lobby(host, { kind: 'kick', playerId: guestId });
    room.clock.time += TEN_MINUTES_MS - 1;
    const early = room.join('Bartek', { code, clientId: GUEST_CLIENT });
    expect(lastError(early)).toBe('kickCooldown');
    expect(early.last('welcome')).toBeUndefined();
    const watcher = room.join('Bartek', { code, clientId: GUEST_CLIENT, as: 'spectator' });
    expect(lastError(watcher)).toBe('kickCooldown');
    // Another browser in the same class is not affected.
    const classmate = room.join('Celina', { code, clientId: 'other-browser-003' });
    expect(classmate.last('welcome')?.roomCode).toBe(code);
    room.clock.time += 1;
    const later = room.join('Bartek', { code, clientId: GUEST_CLIENT });
    expect(later.last('welcome')?.roomCode).toBe(code);
    expect(view(code).players.map((p) => p.nickname)).toEqual(['Ala', 'Celina', 'Bartek']);
  });

  it('answers invalidTarget for the host itself and for an unknown member', () => {
    const { host, code, hostId } = lobbyOfTwo();
    room.lobby(host, { kind: 'kick', playerId: hostId });
    expect(lastError(host)).toBe('invalidTarget');
    room.lobby(host, { kind: 'kick', playerId: 'p99' });
    expect(lastError(host)).toBe('invalidTarget');
    expect(view(code).players).toHaveLength(2);
    expect(host.closed).toBeNull();
  });

  it('removes a disconnected member and a spectator, and works mid-level', () => {
    const { host, guest, code, hostId, guestId } = lobbyOfTwo();
    room.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    const watcher = room.join('Widz', { code, as: 'spectator', clientId: 'watcher-browser-04' });
    const watcherId = room.welcomeOf(watcher).playerId;
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    room.registry.handleDisconnect(guest, false);
    room.lobby(host, { kind: 'kick', playerId: guestId });
    expect(view(code).players.map((p) => p.id)).toEqual([hostId]);
    expect(Object.keys(view(code).game.players)).toEqual([hostId]);
    room.lobby(host, { kind: 'kick', playerId: watcherId });
    expect(watcher.last('error')?.code).toBe('kicked');
    expect(watcher.closed?.code).toBe(4002);
    expect(view(code).spectators).toEqual([]);
    // The cooldown follows the disconnected guest's browser too.
    expect(lastError(room.join('Bartek', { code, clientId: GUEST_CLIENT }))).toBe('kickCooldown');
  });

  it('kicks a member without a client id with no cooldown to record', () => {
    const host = room.join('Ala');
    const code = room.welcomeOf(host).roomCode;
    const guest = room.join('Bartek', { code });
    room.lobby(host, { kind: 'kick', playerId: room.welcomeOf(guest).playerId });
    expect(guest.closed?.code).toBe(4002);
    expect(room.join('Bartek', { code }).last('welcome')?.roomCode).toBe(code);
  });
});

describe('transferHost', () => {
  it('hands the host to a connected member', () => {
    const { host, guest, code, hostId, guestId } = lobbyOfTwo();
    room.lobby(host, { kind: 'transferHost', playerId: guestId });
    expect(view(code).hostId).toBe(guestId);
    expect(guest.last('roomState')?.hostId).toBe(guestId);
    // The old host is a guest now.
    room.lobby(host, { kind: 'setRoomName', name: '3B piątek' });
    expect(lastError(host)).toBe('notHost');
    room.lobby(guest, { kind: 'transferHost', playerId: hostId });
    expect(view(code).hostId).toBe(hostId);
  });

  it('rejects a disconnected target, the host itself and an unknown member', () => {
    const { host, guest, code, hostId, guestId } = lobbyOfTwo();
    room.registry.handleDisconnect(guest, false);
    const before = host.all('error').length;
    for (const playerId of [guestId, hostId, 'p99']) {
      room.lobby(host, { kind: 'transferHost', playerId });
    }
    expect(
      host
        .all('error')
        .slice(before)
        .map((e) => e.code),
    ).toEqual(['invalidTarget', 'invalidTarget', 'invalidTarget']);
    expect(view(code).hostId).toBe(hostId);
  });

  it('may hand the host to a spectator', () => {
    const { host, code } = lobbyOfTwo();
    room.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    const watcher = room.join('Pani', { code, as: 'spectator' });
    const watcherId = room.welcomeOf(watcher).playerId;
    room.lobby(host, { kind: 'transferHost', playerId: watcherId });
    expect(watcher.last('roomState')?.hostId).toBe(watcherId);
  });
});
