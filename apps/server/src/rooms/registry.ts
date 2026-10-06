// In-memory rooms: create/join/leave, reconnect slots, host hand-over, input queues and the
// per-tick simulation step. Transport-agnostic: sockets are injected as `Connection`s and
// broadcasts go through a `Hub`, so all of this is testable in-process.
import {
  DEFAULT_LEVEL_ID,
  getLevel,
  type Level,
  type Story,
  storiesForLevel,
} from '@redakcja/content';
import {
  addPlayer,
  type ClientMessage,
  COMMAND_QUEUE_MAX,
  createGameState,
  type ErrorCode,
  encodeMessage,
  type GameEvent,
  type GameState,
  INPUT_QUEUE_CATCH_UP_THRESHOLD,
  INPUT_QUEUE_MAX,
  type JoinMessage,
  type LobbyAction,
  MAX_PLAYERS,
  PLAYER_COLOR_COUNT,
  type PlayerCommand,
  type PlayerInput,
  PROTOCOL_VERSION,
  parseLayout,
  type QueuedCommand,
  RECONNECT_GRACE_MS,
  type Role,
  type RoomPhase,
  removePlayer as removeSimPlayer,
  type ServerMessage,
  type SimContext,
  spawnPoint,
  step,
  TICK_MS,
  type TileMap,
  timeLeftMs,
} from '@redakcja/shared';
import { log } from '../log.ts';
import { generateReconnectToken, generateRoomCode, secureRandom } from './codes.ts';
import { CLOSE_REPLACED, type Connection, type Hub } from './connection.ts';

type RoomPlayer = {
  id: string;
  nickname: string;
  colorIndex: number;
  reconnectToken: string;
  connection: Connection | null;
  /** Server time when the connection dropped; null while connected. */
  disconnectedAt: number | null;
  inputQueue: PlayerInput[];
  lastQueuedSeq: number;
  /** Decisions (verdicts, minigame results, pings) waiting for the next tick. */
  commandQueue: PlayerCommand[];
  role: Role | null;
  ready: boolean;
};

type Room = {
  code: string;
  hostId: string;
  phase: RoomPhase;
  /** Insertion order is join order. */
  players: Map<string, RoomPlayer>;
  game: GameState;
  level: Level;
  stories: Readonly<Record<string, Story>>;
  map: TileMap;
  nextPlayerNumber: number;
};

function requireLevel(id: string): Level {
  const level = getLevel(id);
  if (!level) {
    throw new Error(`Unknown level "${id}"`);
  }
  return level;
}

type Membership = { roomCode: string; playerId: string };

export type RegistryOptions = {
  hub: Hub;
  now?: () => number;
  random?: () => number;
  /** Called when the first room is created, so the loop can start. */
  onActive?: () => void;
  /** Simulation step; injectable so tests can drive phases (e.g. force `state.ended`). */
  step?: typeof step;
};

export type RoomRegistry = ReturnType<typeof createRoomRegistry>;

export function createRoomRegistry(options: RegistryOptions) {
  const { hub } = options;
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? secureRandom;
  const stepGame = options.step ?? step;
  const rooms = new Map<string, Room>();
  const memberships = new Map<string, Membership>();
  const tokens = new Map<string, Membership>();

  const topic = (code: string) => `room:${code}`;

  function send(connection: Connection, message: ServerMessage): void {
    connection.send(encodeMessage(message));
  }

  function sendError(connection: Connection, code: ErrorCode, detail?: string): void {
    send(
      connection,
      detail === undefined ? { type: 'error', code } : { type: 'error', code, detail },
    );
  }

  function broadcast(room: Room, message: ServerMessage): void {
    hub.publish(topic(room.code), encodeMessage(message));
  }

  function broadcastEvent(room: Room, event: GameEvent): void {
    broadcast(room, { type: 'event', tick: room.game.tick, event });
  }

  function broadcastRoomState(room: Room): void {
    broadcast(room, {
      type: 'roomState',
      roomCode: room.code,
      hostId: room.hostId,
      phase: room.phase,
      levelId: room.level.id,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        colorIndex: p.colorIndex,
        connected: p.connection !== null,
        role: p.role,
        ready: p.ready,
      })),
    });
  }

  function freeColorIndex(room: Room): number {
    const used = new Set([...room.players.values()].map((p) => p.colorIndex));
    for (let i = 0; i < PLAYER_COLOR_COUNT; i++) {
      if (!used.has(i)) {
        return i;
      }
    }
    return 0;
  }

  function attach(room: Room, player: RoomPlayer, connection: Connection): void {
    player.connection = connection;
    player.disconnectedAt = null;
    memberships.set(connection.id, { roomCode: room.code, playerId: player.id });
    connection.subscribe(topic(room.code));
    send(connection, {
      type: 'welcome',
      playerId: player.id,
      roomCode: room.code,
      reconnectToken: player.reconnectToken,
    });
  }

  function addToRoom(room: Room, nickname: string, connection: Connection): RoomPlayer {
    const player: RoomPlayer = {
      id: `p${room.nextPlayerNumber++}`,
      nickname,
      colorIndex: freeColorIndex(room),
      reconnectToken: generateReconnectToken(),
      connection: null,
      disconnectedAt: null,
      inputQueue: [],
      lastQueuedSeq: -1,
      commandQueue: [],
      role: null,
      ready: false,
    };
    room.players.set(player.id, player);
    tokens.set(player.reconnectToken, { roomCode: room.code, playerId: player.id });
    if (room.phase === 'playing') {
      room.game = addPlayer(
        room.game,
        player.id,
        spawnPoint(room.map, player.colorIndex),
        player.role,
      );
    }
    attach(room, player, connection);
    return player;
  }

  function handleJoin(connection: Connection, message: JoinMessage): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      sendError(connection, 'protocolMismatch', `server speaks ${PROTOCOL_VERSION}`);
      return;
    }
    if (memberships.has(connection.id)) {
      sendError(connection, 'invalidMessage', 'already in a room');
      return;
    }

    if (message.reconnectToken !== undefined) {
      const membership = tokens.get(message.reconnectToken);
      const room = membership ? rooms.get(membership.roomCode) : undefined;
      const player = membership ? room?.players.get(membership.playerId) : undefined;
      if (!room || !player) {
        sendError(connection, 'reconnectFailed');
        return;
      }
      const previous = player.connection;
      if (previous) {
        // Same player opened a second socket (e.g. a quick reload): the new one wins.
        memberships.delete(previous.id);
        previous.unsubscribe(topic(room.code));
        previous.close(CLOSE_REPLACED, 'replaced');
      }
      attach(room, player, connection);
      log.info('player reconnected', { room: room.code, player: player.id });
      broadcastEvent(room, { kind: 'playerReconnected', playerId: player.id });
      broadcastRoomState(room);
      return;
    }

    if (message.roomCode === undefined) {
      const code = generateRoomCode(random, new Set(rooms.keys()));
      const level = requireLevel(DEFAULT_LEVEL_ID);
      const map = parseLayout(level.layout);
      const room: Room = {
        code,
        hostId: '',
        phase: 'lobby',
        players: new Map(),
        game: createGameState({ map }),
        level,
        stories: storiesForLevel(level),
        map,
        nextPlayerNumber: 1,
      };
      rooms.set(code, room);
      const player = addToRoom(room, message.nickname, connection);
      room.hostId = player.id;
      log.info('room created', { room: code, player: player.id });
      broadcastRoomState(room);
      options.onActive?.();
      return;
    }

    const room = rooms.get(message.roomCode);
    if (!room) {
      sendError(connection, 'roomNotFound');
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      sendError(connection, 'roomFull');
      return;
    }
    const player = addToRoom(room, message.nickname, connection);
    log.info('player joined', { room: room.code, player: player.id });
    broadcastEvent(room, { kind: 'playerJoined', playerId: player.id });
    broadcastRoomState(room);
  }

  function handleMessage(connection: Connection, message: ClientMessage): void {
    switch (message.type) {
      case 'join':
        handleJoin(connection, message);
        return;
      case 'heartbeat':
        send(connection, { type: 'heartbeatAck', clientTime: message.clientTime });
        return;
      case 'lobby':
      case 'command':
      case 'input': {
        const membership = memberships.get(connection.id);
        const room = membership ? rooms.get(membership.roomCode) : undefined;
        const player = membership ? room?.players.get(membership.playerId) : undefined;
        if (!room || !player) {
          sendError(connection, 'notInRoom');
          return;
        }
        if (message.type === 'lobby') {
          handleLobby(room, player, message.action);
        } else if (message.type === 'command') {
          enqueueCommand(room, player, message.command);
        } else {
          enqueueInput(room, player, message);
        }
        return;
      }
    }
  }

  function rejectNotHost(player: RoomPlayer): void {
    if (player.connection) {
      sendError(player.connection, 'notHost');
    }
  }

  function handleLobby(room: Room, player: RoomPlayer, action: LobbyAction): void {
    switch (action.kind) {
      case 'start': {
        if (player.id !== room.hostId) {
          rejectNotHost(player);
          return;
        }
        // Start works from the lobby and, as a replay, straight from the results screen. The
        // same ready gate applies in both phases (readiness may be toggled during results too).
        if (room.phase === 'playing') {
          return;
        }
        const waitingFor = notReadyPlayers(room);
        if (waitingFor.length > 0) {
          if (player.connection) {
            sendError(player.connection, 'notReady', `waiting for ${waitingFor.join(', ')}`);
          }
          return;
        }
        startLevel(room);
        return;
      }
      case 'setRole':
        // Roles are non-exclusive; they are fixed for the duration of a level.
        if (room.phase === 'playing') {
          return;
        }
        player.role = action.role;
        broadcastRoomState(room);
        return;
      case 'setReady':
        // Allowed in `results` as well so a direct replay can pass the ready gate.
        if (room.phase === 'playing') {
          return;
        }
        player.ready = action.ready;
        broadcastRoomState(room);
        return;
      case 'selectLevel': {
        if (player.id !== room.hostId) {
          rejectNotHost(player);
          return;
        }
        const level = getLevel(action.levelId);
        if (!level) {
          if (player.connection) {
            sendError(player.connection, 'unknownLevel');
          }
          return;
        }
        if (room.phase !== 'lobby') {
          return;
        }
        room.level = level;
        room.stories = storiesForLevel(level);
        room.map = parseLayout(level.layout);
        room.game = createGameState({ map: room.map });
        // Every (re)selection asks players to confirm again, so nobody is ready for a level
        // they have not seen.
        resetReady(room);
        broadcastRoomState(room);
        return;
      }
      case 'backToLobby':
        if (player.id !== room.hostId) {
          rejectNotHost(player);
          return;
        }
        if (room.phase !== 'results') {
          return;
        }
        room.phase = 'lobby';
        // Drop the finished run; the next start builds a fresh game from the room's map.
        room.game = createGameState({ map: room.map });
        for (const p of room.players.values()) {
          p.inputQueue = [];
          p.lastQueuedSeq = -1;
          p.commandQueue = [];
        }
        resetReady(room);
        broadcastRoomState(room);
        return;
    }
  }

  /** Nicknames of connected non-host players who have not pressed ready. The host is
   * implicitly ready by pressing start; disconnected players never block the start. */
  function notReadyPlayers(room: Room): string[] {
    return [...room.players.values()]
      .filter((p) => p.id !== room.hostId && p.connection !== null && !p.ready)
      .map((p) => p.nickname);
  }

  function resetReady(room: Room): void {
    for (const p of room.players.values()) {
      p.ready = false;
    }
  }

  function startLevel(room: Room): void {
    room.phase = 'playing';
    let game = createGameState({ map: room.map, seed: Math.floor(random() * 0x7fffffff) });
    for (const p of room.players.values()) {
      game = addPlayer(game, p.id, spawnPoint(room.map, p.colorIndex), p.role);
      p.inputQueue = [];
      p.lastQueuedSeq = -1;
      p.commandQueue = [];
      p.ready = false;
    }
    room.game = game;
    log.info('game started', { room: room.code, level: room.level.id });
    broadcastEvent(room, { kind: 'gameStarted' });
    broadcastRoomState(room);
  }

  function enqueueCommand(room: Room, player: RoomPlayer, command: PlayerCommand): void {
    if (room.phase !== 'playing' || player.commandQueue.length >= COMMAND_QUEUE_MAX) {
      return;
    }
    player.commandQueue.push(command);
  }

  function enqueueInput(room: Room, player: RoomPlayer, input: PlayerInput): void {
    if (room.phase !== 'playing' || input.seq <= player.lastQueuedSeq) {
      return;
    }
    player.lastQueuedSeq = input.seq;
    player.inputQueue.push({ seq: input.seq, move: input.move, actions: input.actions });
    if (player.inputQueue.length > INPUT_QUEUE_MAX) {
      player.inputQueue.splice(0, player.inputQueue.length - INPUT_QUEUE_MAX);
    }
  }

  function removePlayer(room: Room, player: RoomPlayer): void {
    room.players.delete(player.id);
    tokens.delete(player.reconnectToken);
    if (player.connection) {
      memberships.delete(player.connection.id);
      player.connection.unsubscribe(topic(room.code));
    }
    room.game = removeSimPlayer(room.game, player.id);
    log.info('player left', { room: room.code, player: player.id });
    if (room.players.size === 0) {
      rooms.delete(room.code);
      log.info('room closed', { room: room.code });
      return;
    }
    if (room.hostId === player.id) {
      reassignHost(room);
    }
    broadcastEvent(room, { kind: 'playerLeft', playerId: player.id });
    broadcastRoomState(room);
  }

  function reassignHost(room: Room): void {
    const players = [...room.players.values()];
    const next = players.find((p) => p.connection !== null) ?? players[0];
    if (next) {
      room.hostId = next.id;
    }
  }

  /** Called when a socket closes. `intentional` = the client left on purpose (close code 1000). */
  function handleDisconnect(connection: Connection, intentional: boolean): void {
    const membership = memberships.get(connection.id);
    memberships.delete(connection.id);
    if (!membership) {
      return;
    }
    const room = rooms.get(membership.roomCode);
    const player = room?.players.get(membership.playerId);
    if (!room || !player || player.connection?.id !== connection.id) {
      return;
    }
    if (intentional) {
      removePlayer(room, player);
      return;
    }
    player.connection = null;
    player.disconnectedAt = now();
    player.inputQueue = [];
    player.commandQueue = [];
    if (room.hostId === player.id) {
      reassignHost(room);
    }
    log.info('player disconnected', { room: room.code, player: player.id });
    broadcastRoomState(room);
  }

  /** Advances every room by one tick: expires slots, steps the simulation, sends snapshots. */
  function tick(): void {
    const time = now();
    for (const room of [...rooms.values()]) {
      for (const player of [...room.players.values()]) {
        if (player.disconnectedAt !== null && time - player.disconnectedAt >= RECONNECT_GRACE_MS) {
          removePlayer(room, player);
        }
      }
      if (!rooms.has(room.code) || room.phase !== 'playing') {
        continue;
      }
      const inputs: Record<string, PlayerInput[]> = {};
      const commands: QueuedCommand[] = [];
      for (const player of room.players.values()) {
        // One input per tick keeps the server in lockstep with client prediction; a queue that
        // grew from network jitter is drained one extra input per tick.
        const count = player.inputQueue.length > INPUT_QUEUE_CATCH_UP_THRESHOLD ? 2 : 1;
        inputs[player.id] = player.inputQueue.splice(0, count);
        for (const command of player.commandQueue.splice(0)) {
          commands.push({ playerId: player.id, command });
        }
      }
      const ctx: SimContext = {
        dtMs: TICK_MS,
        map: room.map,
        level: room.level,
        stories: room.stories,
      };
      const result = stepGame(room.game, inputs, commands, ctx);
      room.game = result.state;
      for (const event of result.events) {
        broadcastEvent(room, event);
      }
      broadcastSnapshot(room);
      if (room.game.ended) {
        endLevel(room);
      }
    }
  }

  function broadcastSnapshot(room: Room): void {
    const game = room.game;
    broadcast(room, {
      type: 'snapshot',
      tick: game.tick,
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        facing: p.facing,
        moving: p.moving,
        lastInputSeq: p.lastInputSeq,
      })),
      elapsedMs: game.elapsedMs,
      timeLeftMs: timeLeftMs(game, room.level.durationS),
      score: game.score,
      credibility: game.credibility,
      folders: Object.values(game.folders),
      stations: Object.values(game.stations),
      desks: Object.values(game.desks),
    });
  }

  function endLevel(room: Room): void {
    const { game } = room;
    const outcome = game.ended ?? { won: false, stars: 0 };
    room.phase = 'results';
    log.info('level ended', { room: room.code, level: room.level.id, ...outcome });
    broadcast(room, {
      type: 'levelEnd',
      levelId: room.level.id,
      won: outcome.won,
      stars: outcome.stars,
      score: game.score,
      credibility: game.credibility,
      results: game.results,
    });
    broadcastRoomState(room);
  }

  return {
    handleMessage,
    handleDisconnect,
    tick,
    sendError,
    get roomCount() {
      return rooms.size;
    },
    /** Read-only view for tests and diagnostics. */
    inspect(code: string) {
      const room = rooms.get(code);
      if (!room) {
        return undefined;
      }
      return {
        hostId: room.hostId,
        phase: room.phase,
        levelId: room.level.id,
        game: room.game,
        players: [...room.players.values()].map((p) => ({
          id: p.id,
          nickname: p.nickname,
          colorIndex: p.colorIndex,
          connected: p.connection !== null,
          queued: p.inputQueue.length,
          role: p.role,
          ready: p.ready,
        })),
      };
    },
  };
}
