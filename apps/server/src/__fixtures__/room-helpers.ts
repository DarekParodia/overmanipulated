// Shared room-test harness (S7-79): a registry on a fake hub that also records every publish by
// topic, a controllable clock, join/lobby/input helpers and `forceStep`, which wraps the real
// sim step and changes one team's result once; `versusRoom` (S7-80) builds a ready versus lobby.
// New room tests use it; the older files keep their local helpers.
import {
  BRIEFING_DURATION_MS,
  type GameEvent,
  type GameState,
  type LobbyAction,
  type Look,
  type MemberKind,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ServerMessage,
  step,
  type TeamIndex,
} from '@redakcja/shared';
import type { Hub } from '../rooms/connection.ts';
import { createRoomRegistry, type RegistryOptions } from '../rooms/registry.ts';
import { createFakeHub, type FakeConnection } from './fake-transport.ts';

type StepResult = { state: GameState; events: GameEvent[] };

export type JoinFields = {
  code?: string;
  as?: MemberKind;
  token?: string;
  clientId?: string;
  /** The profile's look (S7-105). */
  look?: Look;
};

export function createRoomHarness(options: Omit<Partial<RegistryOptions>, 'hub' | 'step'> = {}) {
  const fake = createFakeHub();
  const published: { topic: string; message: ServerMessage }[] = [];
  const hub: Hub = {
    publish(topic, data) {
      const parsed = parseServerMessage(data);
      if (!parsed.ok) {
        throw new Error(`Server published an invalid message: ${parsed.error}`);
      }
      published.push({ topic, message: parsed.message });
      fake.hub.publish(topic, data);
    },
  };
  const clock = { time: 0 };
  /** One-shot changes to the next step result of a team, by room code. */
  const pending: { code: string; team: TeamIndex; change: (r: StepResult) => StepResult }[] = [];

  const testStep: typeof step = (state, inputs, commands, ctx) => {
    const result = step(state, inputs, commands, ctx);
    for (const [index, entry] of pending.entries()) {
      // The registry passes each team's current game, so identity finds the team being stepped.
      if (registry.inspect(entry.code)?.games[entry.team] === state) {
        pending.splice(index, 1);
        return entry.change(result);
      }
    }
    return result;
  };

  const registry = createRoomRegistry({
    now: () => clock.time,
    wallClock: () => 1_700_000_000_000 + clock.time,
    ...options,
    hub,
    step: testStep,
  });

  function join(nickname: string, fields: JoinFields = {}): FakeConnection {
    const connection = fake.connect();
    registry.handleMessage(connection, {
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname,
      ...(fields.code === undefined ? {} : { roomCode: fields.code }),
      ...(fields.as === undefined ? {} : { as: fields.as }),
      ...(fields.token === undefined ? {} : { reconnectToken: fields.token }),
      ...(fields.clientId === undefined ? {} : { clientId: fields.clientId }),
      ...(fields.look === undefined ? {} : { look: fields.look }),
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

  function lobby(connection: FakeConnection, action: LobbyAction): void {
    registry.handleMessage(connection, { type: 'lobby', action });
  }

  /** Host presses start and the briefing runs out, so the level is playing. */
  function startPastBriefing(host: FakeConnection): void {
    lobby(host, { kind: 'start' });
    clock.time += BRIEFING_DURATION_MS;
    registry.tick();
  }

  function ticks(count: number): void {
    for (let i = 0; i < count; i++) {
      registry.tick();
    }
  }

  /**
   * A versus lobby: the first nickname hosts and switches to versus, the others join in order
   * (each into the smaller team, so they alternate: Kurier, Głos, Kurier, …) and are ready.
   */
  function versusRoom(nicknames: readonly [string, ...string[]]) {
    const [hostName, ...guestNames] = nicknames;
    const host = join(hostName);
    const code = welcomeOf(host).roomCode;
    lobby(host, { kind: 'setMode', mode: 'versus' });
    const guests = guestNames.map((nickname) => join(nickname, { code }));
    for (const guest of guests) {
      lobby(guest, { kind: 'setReady', ready: true });
    }
    const connections = [host, ...guests];
    return {
      code,
      host,
      connections,
      ids: connections.map((connection) => welcomeOf(connection).playerId),
    };
  }

  /** Changes `team`'s result of the room's next step once (the real step still runs first). */
  function forceStep(
    code: string,
    team: TeamIndex,
    change: (result: StepResult) => StepResult,
  ): void {
    pending.push({ code, team, change });
  }

  /** Every message published on `topic`, in order. */
  function onTopic(topic: string): ServerMessage[] {
    return published.filter((entry) => entry.topic === topic).map((entry) => entry.message);
  }

  return {
    registry,
    fake,
    clock,
    published,
    join,
    welcomeOf,
    lobby,
    startPastBriefing,
    versusRoom,
    ticks,
    forceStep,
    onTopic,
  };
}
