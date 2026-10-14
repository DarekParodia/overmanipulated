// The player's look on the server (S7-105): a preferred colour from the join or `setLook` is
// honoured when no teammate holds it, else the lowest free colour, with no error; the accessory
// always applies; `setLook` is a lobby-only action.
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  type LobbyPlayer,
  lobbyPlayerSchema,
} from '@redakcja/shared';
import type { FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomHarness } from '../__fixtures__/room-helpers.ts';

let room: ReturnType<typeof createRoomHarness>;

beforeEach(() => {
  room = createRoomHarness({
    random: () => 0.25,
    settings: () => ({
      maxRooms: 10,
      features: { ...DEFAULT_FEATURE_FLAGS, versus: true, spectators: true },
      defaultDifficulty: DEFAULT_DIFFICULTY,
    }),
  });
});

/** The players of the latest roomState this connection received, by nickname. */
function players(connection: FakeConnection): Map<string, LobbyPlayer> {
  const state = connection.last('roomState');
  if (!state) {
    throw new Error('no roomState received');
  }
  return new Map(state.players.map((p) => [p.nickname, p]));
}

function player(connection: FakeConnection, nickname: string): LobbyPlayer {
  const found = players(connection).get(nickname);
  if (!found) {
    throw new Error(`${nickname} is not in the room`);
  }
  return found;
}

describe('preferred colour on join (S7-105)', () => {
  it('assigns a free preferred colour', () => {
    const host = room.join('Ala', { look: { color: 2, accessory: 'none' } });
    expect(player(host, 'Ala').colorIndex).toBe(2);
  });

  it('falls back to the lowest free colour when the preferred one is taken', () => {
    const host = room.join('Ala', { look: { color: 0, accessory: 'none' } });
    const code = room.welcomeOf(host).roomCode;
    const guest = room.join('Bartek', { code, look: { color: 0, accessory: 'scarf' } });
    expect(player(guest, 'Ala').colorIndex).toBe(0);
    expect(player(guest, 'Bartek').colorIndex).toBe(1);
    expect(guest.last('error')).toBeUndefined();
  });

  it('skips taken colours below the fallback', () => {
    const host = room.join('Ala', { look: { color: 1, accessory: 'none' } });
    const code = room.welcomeOf(host).roomCode;
    room.join('Bartek', { code });
    const third = room.join('Celina', { code, look: { color: 1, accessory: 'none' } });
    // Ala holds 1, Bartek took the lowest free 0, so Celina's taken 1 falls back to 2.
    expect(player(third, 'Bartek').colorIndex).toBe(0);
    expect(player(third, 'Celina').colorIndex).toBe(2);
  });

  it('gives the lowest free colour without a look and wears no accessory', () => {
    const host = room.join('Ala');
    expect(player(host, 'Ala').colorIndex).toBe(0);
    expect(player(host, 'Ala').accessory).toBe('none');
  });

  it('sends the accessory from the join in every roomState', () => {
    const host = room.join('Ala', { look: { color: null, accessory: 'bowTie' } });
    const code = room.welcomeOf(host).roomCode;
    const guest = room.join('Bartek', { code, look: { color: null, accessory: 'pressBadge' } });
    expect(player(host, 'Ala').accessory).toBe('bowTie');
    expect(player(host, 'Bartek').accessory).toBe('pressBadge');
    expect(player(guest, 'Ala').colorIndex).toBe(0);
    expect(player(guest, 'Bartek').colorIndex).toBe(1);
  });
});

describe('setLook (S7-105)', () => {
  function lobbyOfTwo() {
    const host = room.join('Ala');
    const code = room.welcomeOf(host).roomCode;
    const guest = room.join('Bartek', { code });
    return { host, guest, code };
  }

  it('takes a free colour and the accessory in the lobby', () => {
    const { host, guest } = lobbyOfTwo();
    room.lobby(guest, { kind: 'setLook', look: { color: 3, accessory: 'scarf' } });
    expect(player(host, 'Bartek').colorIndex).toBe(3);
    expect(player(host, 'Bartek').accessory).toBe('scarf');
  });

  it('keeps the current colour when a teammate holds the preferred one, but wears the accessory', () => {
    const { host, guest } = lobbyOfTwo();
    room.lobby(guest, { kind: 'setLook', look: { color: 0, accessory: 'bowTie' } });
    expect(player(host, 'Ala').colorIndex).toBe(0);
    expect(player(host, 'Bartek').colorIndex).toBe(1);
    expect(player(host, 'Bartek').accessory).toBe('bowTie');
    expect(guest.last('error')).toBeUndefined();
  });

  it('keeps the current colour for a null preference', () => {
    const { host, guest } = lobbyOfTwo();
    room.lobby(guest, { kind: 'setLook', look: { color: null, accessory: 'none' } });
    expect(player(host, 'Bartek').colorIndex).toBe(1);
  });

  it('sends no roomState when nothing visible changes', () => {
    const { host, guest } = lobbyOfTwo();
    const before = host.received.length;
    // Bartek already holds 1 and wears nothing; Ala holds 0, so 1 stays.
    room.lobby(guest, { kind: 'setLook', look: { color: 0, accessory: 'none' } });
    expect(host.received.slice(before).filter((m) => m.type === 'roomState')).toHaveLength(0);
  });

  it('keeps a spectator look for its return to playing', () => {
    const host = room.join('Ala');
    const code = room.welcomeOf(host).roomCode;
    room.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    const watcher = room.join('Bartek', { code, as: 'spectator' });
    room.lobby(watcher, { kind: 'setLook', look: { color: 2, accessory: 'scarf' } });
    room.lobby(watcher, { kind: 'setSpectator', spectator: false });
    expect(player(host, 'Bartek').colorIndex).toBe(2);
    expect(player(host, 'Bartek').accessory).toBe('scarf');
  });

  it('is ignored while playing', () => {
    const { host, guest } = lobbyOfTwo();
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    expect(room.registry.inspect(room.welcomeOf(host).roomCode)?.phase).toBe('playing');
    const before = guest.received.length;
    room.lobby(guest, { kind: 'setLook', look: { color: 3, accessory: 'scarf' } });
    expect(guest.received.slice(before).filter((m) => m.type === 'roomState')).toHaveLength(0);
    expect(player(host, 'Bartek').colorIndex).toBe(1);
    expect(player(host, 'Bartek').accessory).toBe('none');
  });

  it('is ignored during the briefing', () => {
    const { host, guest } = lobbyOfTwo();
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.lobby(host, { kind: 'start' });
    room.lobby(guest, { kind: 'setLook', look: { color: 2, accessory: 'pressBadge' } });
    expect(player(host, 'Bartek').colorIndex).toBe(1);
    expect(player(host, 'Bartek').accessory).toBe('none');
  });

  it('keeps the preference for a later team move in versus', () => {
    const host = room.join('Ala', { look: { color: 2, accessory: 'none' } });
    const code = room.welcomeOf(host).roomCode;
    room.lobby(host, { kind: 'setMode', mode: 'versus' });
    const guest = room.join('Bartek', { code, look: { color: 2, accessory: 'none' } });
    // Ala (Kurier) and Bartek (Głos) both hold 2: the newsrooms reuse the four colours.
    expect(player(host, 'Ala').team).toBe(0);
    expect(player(host, 'Bartek').team).toBe(1);
    expect(player(host, 'Bartek').colorIndex).toBe(2);
    room.lobby(guest, { kind: 'setTeam', team: 0 });
    // Ala holds 2 in Kurier, so Bartek takes the lowest free there.
    expect(player(host, 'Bartek').colorIndex).toBe(0);
    room.lobby(host, { kind: 'setTeam', team: 1 });
    // Ala moves to the empty Głos and takes her preferred 2 again.
    expect(player(host, 'Ala').colorIndex).toBe(2);
  });

  it('deals preferred colours in join order when the mode changes', () => {
    const host = room.join('Ala', { look: { color: 3, accessory: 'none' } });
    const code = room.welcomeOf(host).roomCode;
    room.join('Bartek', { code, look: { color: 1, accessory: 'none' } });
    room.join('Celina', { code, look: { color: 3, accessory: 'none' } });
    room.lobby(host, { kind: 'setMode', mode: 'versus' });
    // Kurier: Ala 3, Celina wants 3 (taken) → 0; Głos: Bartek 1.
    expect(player(host, 'Ala').colorIndex).toBe(3);
    expect(player(host, 'Bartek').colorIndex).toBe(1);
    expect(player(host, 'Celina').colorIndex).toBe(0);
  });
});

describe('lobbyPlayer.accessory on the wire (S7-105)', () => {
  it('round-trips through zod', () => {
    const wire: LobbyPlayer = {
      id: 'p1',
      nickname: 'Ala',
      colorIndex: 2,
      connected: true,
      role: null,
      ready: false,
      team: 0,
      accessory: 'pressBadge',
    };
    expect(lobbyPlayerSchema.parse(JSON.parse(JSON.stringify(wire)))).toEqual(wire);
    expect(lobbyPlayerSchema.safeParse({ ...wire, accessory: 'hat' }).success).toBe(false);
  });
});
