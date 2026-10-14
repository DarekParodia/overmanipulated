// Server tick benchmark for versus and spectating (S7-92). Builds many full versus rooms in one
// room registry (4 + 4 players each, scripted input every tick, 8 spectators in some rooms),
// then times `registry.tick()` and counts the bytes the server would send. Usage:
//   bun run perf:server -- [--rooms 150] [--spectated 50] [--ticks 200] [--level l1-burza] [--coop]
// (--coop: co-op rooms of 4 instead, the baseline a versus room is compared with).
//
// What it measures: the room loop on one core (expiry, both newsrooms' sim steps, events, the
// embargo, snapshots and the spectator topic, JSON encoding included). The socket writes are not
// in it: the hub only counts bytes, the way Bun's `publish` would multiply them by subscribers.
// docs/performance.md records the result and the 25 ms target (`TICK_TARGET_MS`, half the tick).

import type { Connection, Hub } from '../../apps/server/src/rooms/connection.ts';
import { createRoomRegistry } from '../../apps/server/src/rooms/registry.ts';
import {
  type ClientMessage,
  createRng,
  MAX_SPECTATORS,
  MAX_TEAM_PLAYERS,
  MAX_TEAMS,
  PROTOCOL_VERSION,
  parseServerMessage,
  type RoomMode,
  TICK_MS,
} from '../../packages/shared/src/index.ts';

export type BenchOptions = {
  /** Versus (two newsrooms of `playersPerTeam`) or co-op (one). */
  mode: RoomMode;
  /** Versus rooms alive at once. */
  rooms: number;
  /** How many of them have a full Widownia (the first ones). */
  spectatedRooms: number;
  /** Players per newsroom (two newsrooms per room). */
  playersPerTeam: number;
  /** Spectators in each spectated room. */
  spectatorsPerRoom: number;
  levelId: string;
  /** Ticks run (and not measured) after the level started. */
  warmupTicks: number;
  /** Ticks measured. */
  ticks: number;
  /** Seeds the registry's room codes and run seeds, so two runs build the same rooms. */
  seed: number;
};

/** The mean tick a server must stay under: half the tick, the rest is headroom (S7-92). */
export const TICK_TARGET_MS = TICK_MS / 2;

/** The S7-92 case: 150 versus rooms × 8 scripted inputs, spectators in 50 of them. */
export const DEFAULT_BENCH: BenchOptions = {
  mode: 'versus',
  rooms: 150,
  spectatedRooms: 50,
  playersPerTeam: MAX_TEAM_PLAYERS,
  spectatorsPerRoom: MAX_SPECTATORS,
  levelId: 'l1-burza',
  warmupTicks: 20,
  ticks: 200,
  seed: 92,
};

export type BenchResult = {
  mode: RoomMode;
  rooms: number;
  players: number;
  spectators: number;
  /** Rooms still playing when the measurement ended (all of them, or the bench is wrong). */
  playing: number;
  ticks: number;
  /** `registry.tick()` wall time over the measured ticks. */
  tickMs: { mean: number; p95: number; max: number };
  /** Mean time per tick spent handing the scripted inputs to the registry (outside `tick()`). */
  inputMs: number;
  /** Server egress over the measured ticks, by receiver. */
  bytesPerSecond: {
    total: number;
    /** Everything the players receive (their team topics, the room topic, direct sends). */
    toPlayers: number;
    /** Everything the spectators receive. */
    toSpectators: number;
    /** One room without spectators, on average. */
    perRoom: number;
    /** One room with a full Widownia (players and spectators), on average. */
    perSpectatedRoom: number;
    /** One spectator, on average. */
    perSpectator: number;
  };
};

type CountingConnection = Connection & {
  bytes: number;
  kind: 'player' | 'spectator';
  spectated: boolean;
  /** The room code of the `welcome` this connection got, once it got one. */
  roomCode: string | null;
};

/** `encodeMessage` writes the type first, so a welcome is found without parsing every send. */
const WELCOME_PREFIX = '{"type":"welcome"';

/** A hub and connections that only count bytes: a publish costs its length per subscriber. */
function createCountingHub() {
  const subscriptions = new Map<string, Set<CountingConnection>>();
  let nextId = 1;
  const connections: CountingConnection[] = [];

  const hub: Hub = {
    publish(topic, data) {
      const set = subscriptions.get(topic);
      if (!set || set.size === 0) {
        return;
      }
      const size = Buffer.byteLength(data);
      for (const connection of set) {
        connection.bytes += size;
      }
    },
  };

  function connect(kind: CountingConnection['kind'], spectated: boolean): CountingConnection {
    const connection: CountingConnection = {
      id: `bench-${nextId++}`,
      bytes: 0,
      kind,
      spectated,
      roomCode: null,
      send(data) {
        connection.bytes += Buffer.byteLength(data);
        if (connection.roomCode === null && data.startsWith(WELCOME_PREFIX)) {
          const parsed = parseServerMessage(data);
          if (parsed.ok && parsed.message.type === 'welcome') {
            connection.roomCode = parsed.message.roomCode;
          }
        }
      },
      subscribe(topic) {
        const set = subscriptions.get(topic) ?? new Set();
        set.add(connection);
        subscriptions.set(topic, set);
      },
      unsubscribe(topic) {
        subscriptions.get(topic)?.delete(connection);
      },
      close() {},
    };
    connections.push(connection);
    return connection;
  }

  return { hub, connect, connections };
}

/** The eight compass directions a scripted player walks in (unit vectors). */
const DIAGONAL = Math.SQRT1_2;
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: DIAGONAL, y: DIAGONAL },
  { x: 0, y: 1 },
  { x: -DIAGONAL, y: DIAGONAL },
  { x: -1, y: 0 },
  { x: -DIAGONAL, y: -DIAGONAL },
  { x: 0, y: -1 },
  { x: DIAGONAL, y: -DIAGONAL },
] as const;
/** A scripted player turns every second and presses interact every two seconds. */
const TURN_EVERY_TICKS = 20;
const INTERACT_EVERY_TICKS = 40;
/** It holds work for half a second, then lets go for half a second. */
const WORK_HALF_PERIOD_TICKS = 10;

/**
 * Player `slot`'s input on `tick`: walks one compass direction per second (slots spread out),
 * taps interact every two seconds and holds work half the time. Deterministic.
 */
export function scriptedInput(
  slot: number,
  tick: number,
): Extract<ClientMessage, { type: 'input' }> {
  const turn = Math.floor(tick / TURN_EVERY_TICKS) + slot;
  const move = DIRECTIONS[turn % DIRECTIONS.length] ?? DIRECTIONS[0];
  return {
    type: 'input',
    seq: tick,
    move: { x: move.x, y: move.y },
    actions: {
      interact: (tick + slot * 5) % INTERACT_EVERY_TICKS === 0,
      work: Math.floor(tick / WORK_HALF_PERIOD_TICKS) % 2 === 0,
    },
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function roomCodeOf(connection: CountingConnection): string {
  if (connection.roomCode === null) {
    throw new Error('the host got no welcome');
  }
  return connection.roomCode;
}

/** Builds the rooms, plays the warm-up, then measures `options.ticks` ticks. */
export function runServerTickBench(overrides: Partial<BenchOptions> = {}): BenchResult {
  const merged = { ...DEFAULT_BENCH, ...overrides };
  const options = { ...merged, spectatedRooms: Math.min(merged.spectatedRooms, merged.rooms) };
  const rng = createRng(options.seed);
  const clock = { time: 0 };
  const counting = createCountingHub();
  const registry = createRoomRegistry({
    hub: counting.hub,
    now: () => clock.time,
    wallClock: () => clock.time,
    random: () => rng.next(),
    briefingMs: 0,
    maxRooms: options.rooms,
  });
  const send = (connection: Connection, message: ClientMessage) =>
    registry.handleMessage(connection, message);
  const join = (
    connection: Connection,
    nickname: string,
    fields: { roomCode?: string; as?: 'spectator' } = {},
  ) => send(connection, { type: 'join', protocolVersion: PROTOCOL_VERSION, nickname, ...fields });

  const codes: string[] = [];
  const players: CountingConnection[] = [];
  for (let r = 0; r < options.rooms; r++) {
    const spectated = r < options.spectatedRooms;
    const host = counting.connect('player', spectated);
    join(host, `Bot ${r}`);
    const code = roomCodeOf(host);
    codes.push(code);
    if (options.mode === 'versus') {
      send(host, { type: 'lobby', action: { kind: 'setMode', mode: 'versus' } });
    }
    send(host, { type: 'lobby', action: { kind: 'selectLevel', levelId: options.levelId } });
    if (spectated) {
      send(host, { type: 'lobby', action: { kind: 'setSpectatorsAllowed', allowed: true } });
    }
    players.push(host);
    const teams = options.mode === 'versus' ? MAX_TEAMS : 1;
    for (let p = 1; p < options.playersPerTeam * teams; p++) {
      const guest = counting.connect('player', spectated);
      join(guest, `Bot ${r}-${p}`, { roomCode: code });
      send(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
      players.push(guest);
    }
    for (let s = 0; spectated && s < options.spectatorsPerRoom; s++) {
      join(counting.connect('spectator', true), `Widz ${r}-${s}`, {
        roomCode: code,
        as: 'spectator',
      });
    }
    send(host, { type: 'lobby', action: { kind: 'start' } });
  }

  let inputTick = 0;
  const feedInputs = () => {
    for (const [slot, player] of players.entries()) {
      send(player, scriptedInput(slot, inputTick));
    }
    inputTick++;
  };
  const tick = () => {
    clock.time += TICK_MS;
    registry.tick();
  };

  // The first tick ends the (zero-length) briefing; the warm-up lets folders spawn and JIT settle.
  tick();
  for (let i = 0; i < options.warmupTicks; i++) {
    feedInputs();
    tick();
  }
  for (const connection of counting.connections) {
    connection.bytes = 0;
  }

  const samples: number[] = [];
  let inputTotal = 0;
  for (let i = 0; i < options.ticks; i++) {
    const inputStart = performance.now();
    feedInputs();
    const tickStart = performance.now();
    inputTotal += tickStart - inputStart;
    tick();
    samples.push(performance.now() - tickStart);
  }

  const seconds = (options.ticks * TICK_MS) / 1000;
  const sum = (list: readonly CountingConnection[]) =>
    list.reduce((total, connection) => total + connection.bytes, 0);
  const all = counting.connections;
  const spectators = all.filter((c) => c.kind === 'spectator');
  const quietRooms = options.rooms - options.spectatedRooms;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mode: options.mode,
    rooms: options.rooms,
    players: players.length,
    spectators: spectators.length,
    playing: codes.filter((code) => registry.inspect(code)?.phase === 'playing').length,
    ticks: options.ticks,
    tickMs: {
      mean: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
      p95: percentile(sorted, 0.95),
      max: sorted.at(-1) ?? 0,
    },
    inputMs: inputTotal / Math.max(1, options.ticks),
    bytesPerSecond: {
      total: sum(all) / seconds,
      toPlayers: sum(players) / seconds,
      toSpectators: sum(spectators) / seconds,
      perRoom: quietRooms > 0 ? sum(all.filter((c) => !c.spectated)) / seconds / quietRooms : 0,
      perSpectatedRoom:
        options.spectatedRooms > 0
          ? sum(all.filter((c) => c.spectated)) / seconds / options.spectatedRooms
          : 0,
      perSpectator: spectators.length > 0 ? sum(spectators) / seconds / spectators.length : 0,
    },
  };
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB/s`;
}

/** The bench result as the lines docs/performance.md quotes. */
export function formatBench(result: BenchResult, levelId: string): string {
  const b = result.bytesPerSecond;
  return [
    `server tick bench: ${result.rooms} ${result.mode} rooms on ${levelId}, ${result.players} players, ${result.spectators} spectators, ${result.ticks} ticks (${result.playing} rooms playing)`,
    `tick: mean ${result.tickMs.mean.toFixed(2)} ms, p95 ${result.tickMs.p95.toFixed(2)} ms, max ${result.tickMs.max.toFixed(2)} ms (target < ${TICK_TARGET_MS} ms of the ${TICK_MS} ms tick); inputs ${result.inputMs.toFixed(2)} ms per tick`,
    `egress: total ${kb(b.total)}, players ${kb(b.toPlayers)}, spectators ${kb(b.toSpectators)}`,
    `per room: ${kb(b.perRoom)} without spectators, ${kb(b.perSpectatedRoom)} with ${MAX_SPECTATORS}; per spectator ${kb(b.perSpectator)}`,
  ].join('\n');
}

function numberFlag(args: readonly string[], name: string): number | undefined {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const levelIndex = args.indexOf('--level');
  const overrides: Partial<BenchOptions> = {};
  for (const [flag, key] of [
    ['rooms', 'rooms'],
    ['spectated', 'spectatedRooms'],
    ['ticks', 'ticks'],
  ] as const) {
    const value = numberFlag(args, flag);
    if (value !== undefined) {
      overrides[key] = value;
    }
  }
  const levelId = (levelIndex >= 0 ? args[levelIndex + 1] : undefined) ?? DEFAULT_BENCH.levelId;
  const mode: RoomMode = args.includes('--coop') ? 'coop' : 'versus';
  const result = runServerTickBench({ ...overrides, levelId, mode });
  console.log(formatBench(result, levelId));
  if (result.playing !== result.rooms) {
    console.error('not every room was playing: the bench did not measure what it says');
    process.exit(1);
  }
  if (result.tickMs.mean >= TICK_TARGET_MS) {
    console.warn(
      `mean tick over the ${TICK_TARGET_MS} ms target: lower rooms.maxRooms (MAX_ROOMS) until it holds`,
    );
  }
}
