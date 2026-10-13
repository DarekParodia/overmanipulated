// Protocol 7 (S7-77) on the existing registry: every roomState carries a new room's defaults,
// the new lobby actions change nothing until S7-80..S7-82 serve them, and spectator joins are
// refused until S7-81.
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  type LobbyAction,
  PROTOCOL_VERSION,
} from '@redakcja/shared';
import { createFakeHub, type FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomRegistry, type RoomRegistry } from './registry.ts';

let fake: ReturnType<typeof createFakeHub>;
let registry: RoomRegistry;
let spectatorsFlag = true;

beforeEach(() => {
  spectatorsFlag = true;
  fake = createFakeHub();
  registry = createRoomRegistry({
    hub: fake.hub,
    now: () => 0,
    settings: () => ({
      maxRooms: 10,
      features: { ...DEFAULT_FEATURE_FLAGS, spectators: spectatorsFlag },
      defaultDifficulty: DEFAULT_DIFFICULTY,
    }),
  });
});

function join(
  nickname: string,
  fields: { roomCode?: string; as?: 'player' | 'spectator'; clientId?: string } = {},
): FakeConnection {
  const connection = fake.connect();
  registry.handleMessage(connection, {
    type: 'join',
    protocolVersion: PROTOCOL_VERSION,
    nickname,
    ...fields,
  });
  return connection;
}

function codeOf(connection: FakeConnection): string {
  const welcome = connection.last('welcome');
  if (!welcome) {
    throw new Error('no welcome received');
  }
  return welcome.roomCode;
}

describe('protocol 7 room fields (S7-77)', () => {
  it('sends a new room as co-op, private, unnamed, without a Widownia, everyone in team 0', () => {
    const host = join('Ala', { clientId: 'k'.repeat(16) });
    join('Bartek', { roomCode: codeOf(host), as: 'player' });
    expect(host.last('roomState')).toMatchObject({
      mode: 'coop',
      visibility: 'private',
      name: null,
      spectatorsAllowed: false,
      spectators: [],
    });
    expect(host.last('roomState')?.players.map((p) => [p.nickname, p.team])).toEqual([
      ['Ala', 0],
      ['Bartek', 0],
    ]);
    expect(registry.inspect(codeOf(host))).toMatchObject({
      mode: 'coop',
      visibility: 'private',
      name: null,
      spectatorsAllowed: false,
    });
  });

  it('leaves the room unchanged on the room actions until they are served', () => {
    const host = join('Ala');
    const guest = join('Bartek', { roomCode: codeOf(host) });
    const guestId = guest.last('welcome')?.playerId ?? '';
    const actions: LobbyAction[] = [
      { kind: 'setMode', mode: 'versus' },
      { kind: 'setTeam', team: 1 },
      { kind: 'setSpectator', spectator: true },
      { kind: 'setVisibility', visibility: 'public' },
      { kind: 'setRoomName', name: '3B piątek' },
      { kind: 'setSpectatorsAllowed', allowed: true },
      { kind: 'kick', playerId: guestId },
      { kind: 'transferHost', playerId: guestId },
    ];
    const before = host.received.length;
    for (const action of actions) {
      registry.handleMessage(host, { type: 'lobby', action });
    }
    expect(host.received).toHaveLength(before);
    expect(guest.closed).toBeNull();
    expect(registry.inspect(codeOf(host))).toMatchObject({
      mode: 'coop',
      visibility: 'private',
      name: null,
      spectatorsAllowed: false,
    });
  });

  it('answers a spectator join with spectatorsOff while the Widownia is closed', () => {
    const host = join('Ala');
    const watcher = join('Widz', { roomCode: codeOf(host), as: 'spectator' });
    expect(watcher.last('error')?.code).toBe('spectatorsOff');
    expect(watcher.last('welcome')).toBeUndefined();
    expect(host.last('roomState')?.players).toHaveLength(1);
    expect(join('Widz', { roomCode: 'ZZZZ', as: 'spectator' }).last('error')?.code).toBe(
      'roomNotFound',
    );
  });

  it('answers featureDisabled with the spectators flag off, and to a spectator-created room', () => {
    expect(join('Pani', { as: 'spectator' }).last('error')?.code).toBe('featureDisabled');
    expect(registry.roomCount).toBe(0);
    const host = join('Ala');
    spectatorsFlag = false;
    const watcher = join('Widz', { roomCode: codeOf(host), as: 'spectator' });
    expect(watcher.last('error')?.code).toBe('featureDisabled');
  });
});
