// In-memory rooms: create/join/leave, reconnect slots, host hand-over, input queues and the
// per-tick simulation step. Transport-agnostic: sockets are injected as `Connection`s and
// broadcasts go through a `Hub`, so all of this is testable in-process.
import {
  DEFAULT_LEVEL_ID,
  getLevel,
  LEVELS,
  type Level,
  maxLevelScore,
  prepareRun,
  runSummary,
  STORIES,
  type Story,
  storiesForLevel,
} from '@redakcja/content';
import {
  type Accessory,
  addPlayer,
  applyStatsEvent,
  BRIEFING_DURATION_MS,
  byScore,
  type ClientId,
  type ClientMessage,
  COMMAND_QUEUE_MAX,
  closeSpawnKey,
  conveyorBlocked,
  createEmbargo,
  createGameState,
  crewSnapshot,
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  type Difficulty,
  ENDLESS,
  ENDLESS_LEVEL_ID,
  type ErrorCode,
  emptyPlayerStats,
  encodeMessage,
  type FeatureFlag,
  type GameEvent,
  type GameState,
  INPUT_QUEUE_CATCH_UP_THRESHOLD,
  INPUT_QUEUE_MAX,
  isAcceptableName,
  type JoinMessage,
  type LevelEndMessage,
  type LevelOutcome,
  type LobbyAction,
  type Look,
  MAX_ROOM_PLAYERS,
  MAX_SPECTATORS,
  MAX_TEAM_PLAYERS,
  MAX_TEAMS,
  type MatchStatsMessage,
  type MemberKind,
  MINIGAME_MIN_SOLVE_MS,
  maskForSpectators,
  maskName,
  matchDurationMs,
  nextScheduledSpawn,
  openSpawnKey,
  type PlayerCommand,
  type PlayerInput,
  type PlayerStats,
  PROTOCOL_VERSION,
  parseLayout,
  pickColor,
  type QueuedCommand,
  RECONNECT_GRACE_MS,
  type Role,
  type RoomListQuery,
  type RoomListResponse,
  type RoomMode,
  type RoomPhase,
  type RoomSummary,
  type RoomVisibility,
  type RunSummary,
  release,
  releaseAll,
  removePlayer as removeSimPlayer,
  type ServerMessage,
  type SimContext,
  type SnapshotMessage,
  SPECTATOR_SNAPSHOT_INTERVAL_TICKS,
  SPECTATOR_STATS_INTERVAL_TICKS,
  type SpectatorEmbargo,
  type SpectatorEvent,
  simTuning,
  spawnPoint,
  step,
  type TeamIndex,
  type TeamScore,
  type TeamStanding,
  TICK_MS,
  type TileMap,
  takenColors,
  teamScoreOf,
  timeLeftMs,
  unfinishedResults,
  type VersusResult,
  versusOutcome,
} from '@redakcja/shared';
import { KICK_REJOIN_COOLDOWN_MS, MAX_ROOMS, ROOM_LIST_CACHE_MS } from '../limits.ts';
import { log } from '../log.ts';
import type { RoomSettings } from '../public-config.ts';
import { generateReconnectToken, generateRoomCode, secureRandom } from './codes.ts';
import { CLOSE_KICKED, CLOSE_REPLACED, type Connection, type Hub } from './connection.ts';
import { createRoomListCache, queryRoomList } from './room-list.ts';

/** A room member: a player in one newsroom, or a spectator in the Widownia (S7-79). */
type RoomMember = {
  id: string;
  kind: MemberKind;
  /** The member's newsroom; always 0 in co-op. A spectator keeps the last one it played in. */
  team: TeamIndex;
  /** The browser's id from the join (the kick cooldown follows it, S7-82). */
  clientId?: ClientId;
  nickname: string;
  /** Per team: two newsrooms reuse the same four colours and spawn points. */
  colorIndex: number;
  /** The profile's colour (S7-105): taken whenever the team has it free; null = no preference. */
  preferredColor: number | null;
  /** Worn in the lobby and in 3D (S7-105). */
  accessory: Accessory;
  /** Resumes exactly this member, with its kind and team. */
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

/** One newsroom of the room: its own sim, stepped in lockstep with the other team's. */
type TeamRun = {
  game: GameState;
  /** Every player of the team left while playing (the versus forfeit, S7-80). */
  forfeited: boolean;
};

type Room = {
  code: string;
  hostId: string;
  phase: RoomPhase;
  /** Players of every team and spectators; insertion order is join order. */
  members: Map<string, RoomMember>;
  /**
   * One newsroom per team: one in co-op, two in versus. All are built from `map`, share the
   * dealt run and, from the level start, one sim seed.
   */
  teams: [TeamRun, ...TeamRun[]];
  /**
   * The selected level as `getLevel` serves it (a bag level's Normal preview, the endless
   * preview) in the lobby; from the briefing on, the level the dealt run plays.
   */
  level: Level;
  stories: Readonly<Record<string, Story>>;
  /** Picked by the host in the lobby; it persists across level changes and replays. */
  difficulty: Difficulty;
  /**
   * The run dealt at the briefing (`prepareRun`), kept through play and results; null in the
   * lobby. Its seed is drawn apart from the sim seed and never leaves the server.
   */
  run: { seed: number; summary: RunSummary } | null;
  map: TileMap;
  nextPlayerNumber: number;
  /** Set while `phase === 'briefing'`. */
  briefing: { endsAt: number; skippedBy: Set<string> } | null;
  /** Blunder-of-the-day votes of the current results screen, by player id. */
  blunderVotes: Map<string, { storyId: string; rowId: number | null }>;
  /** A solo player has the in-game menu open: the level is not stepped (S7-10). */
  paused: boolean;
  /**
   * Room settings on the wire since protocol 7 (S7-77). A room starts co-op, private and unnamed;
   * its Widownia is closed unless a spectator created the room (S7-81).
   */
  mode: RoomMode;
  visibility: RoomVisibility;
  name: string | null;
  spectatorsAllowed: boolean;
  /** Unix ms (the room browser sorts by it, S7-83). */
  createdAt: number;
  /** Every player's counters of the current level, folded with `applyStatsEvent`. */
  stats: Map<string, PlayerStats>;
  /**
   * The same counters folded over what the Widownia was shown: in versus a verdict counts once
   * its result is revealed, so `matchStats` never gives an embargoed outcome away (S7-81).
   */
  spectatorStats: Map<string, PlayerStats>;
  /** How the versus match ended; null while it runs and in co-op (S7-80). */
  outcome: VersusResult | null;
  /** What the spectator topic still holds back of the current level (S7-81). */
  embargo: SpectatorEmbargo;
  /**
   * Browsers the host kicked, by `clientId`, with the `now()` time their cooldown ends: a join
   * from one of them before then gets `kickCooldown` (S7-82). Room-scoped; expired entries go.
   */
  kicked: Map<ClientId, number>;
};

/** The room's pub/sub topics (protocol v7). */
export const roomTopics = {
  /** Everyone: `roomState`, `gameStarted`. */
  room: (code: string) => `room:${code}`,
  /** One newsroom's players: its snapshots, events and `levelEnd`. */
  team: (code: string, team: TeamIndex) => `room:${code}:t${team}`,
  /** Spectators: every newsroom's snapshots (every 2nd), `levelEnd`s and spectator events. */
  spectators: (code: string) => `room:${code}:spec`,
};

/**
 * The players whose connection dropped (they may still reconnect), for `SimContext.absent`:
 * Podaj teczkę never passes a folder to them. Undefined while everyone is connected.
 */
export function absentPlayerIds(
  players: Iterable<{ id: string; connection: unknown }>,
): ReadonlySet<string> | undefined {
  const absent = new Set<string>();
  for (const player of players) {
    if (player.connection === null) {
      absent.add(player.id);
    }
  }
  return absent.size > 0 ? absent : undefined;
}

function requireLevel(id: string): Level {
  const level = getLevel(id);
  if (!level) {
    throw new Error(`Unknown level "${id}"`);
  }
  return level;
}

/**
 * Lobby actions only a player takes; a spectator's are ignored, so spectators never hold up the
 * ready, briefing or vote gates (S7-81).
 */
const PLAYER_ACTIONS: ReadonlySet<LobbyAction['kind']> = new Set([
  'setRole',
  'setReady',
  'skipBriefing',
  'voteBlunder',
  'setPaused',
]);

/** One `spectatorEvent` as the Widownia gets it: the team it happened in and the event. */
type SpectatorItem = { team: TeamIndex; event: SpectatorEvent };

/** A connection's (or a reconnect token's) one member of one room. */
type Membership = { roomCode: string; memberId: string };

export type RegistryOptions = {
  hub: Hub;
  now?: () => number;
  /** Wall-clock Unix ms for `createdAt` (the room browser's order); defaults to `Date.now`. */
  wallClock?: () => number;
  random?: () => number;
  /** Called when the first room is created, so the loop can start. */
  onActive?: () => void;
  /** Simulation step; injectable so tests can drive phases (e.g. force `state.ended`). */
  step?: typeof step;
  /** How long the briefing lasts before the level starts by itself. */
  briefingMs?: number;
  /**
   * Persists a blunder vote (S3-02) and returns the stored row id. `previousId` is the row of
   * the same player's earlier vote in this run, which the new one replaces.
   */
  recordBlunderVote?: (vote: {
    levelId: string;
    storyId: string;
    previousId: number | null;
  }) => number;
  /** Rooms alive at once; creating another is refused with `roomFull`. Wins over `settings`. */
  maxRooms?: number;
  /**
   * Live settings from config.json (S7-68), read at every room creation so a reload applies to
   * the next room: `maxRooms`, the difficulty a new room starts at, and the feature flags.
   */
  settings?: () => RoomSettings;
  /** Persists a finished endless run for the leaderboard (S4-11), with its difficulty (S7-23). */
  recordLeaderboardEntry?: (entry: {
    roomCode: string;
    players: string[];
    score: number;
    survivedS: number;
    difficulty: Difficulty;
  }) => void;
};

export type RoomRegistry = ReturnType<typeof createRoomRegistry>;

/** The room's players (of one team, when given), in join order. */
function playersOf(room: Pick<Room, 'members'>, team?: TeamIndex): RoomMember[] {
  return [...room.members.values()].filter(
    (m) => m.kind === 'player' && (team === undefined || m.team === team),
  );
}

function spectatorsOf(room: Room): RoomMember[] {
  return [...room.members.values()].filter((m) => m.kind === 'spectator');
}

/** Newsrooms the room's mode plays: 1 in co-op, 2 in versus. */
function teamTotal(room: Room): number {
  return room.mode === 'versus' ? MAX_TEAMS : 1;
}

/**
 * The team a new player joins, or null when every team is full. Co-op has team 0 only; versus
 * picks the smaller team, team 0 on a tie.
 */
export function pickTeam(room: {
  mode: RoomMode;
  members: ReadonlyMap<string, Pick<RoomMember, 'kind' | 'team'>>;
}): TeamIndex | null {
  const sizes = Array.from({ length: room.mode === 'versus' ? MAX_TEAMS : 1 }, () => 0);
  for (const member of room.members.values()) {
    if (member.kind === 'player' && member.team < sizes.length) {
      sizes[member.team] = (sizes[member.team] ?? 0) + 1;
    }
  }
  let best: TeamIndex | null = null;
  let bestSize = MAX_TEAM_PLAYERS;
  for (const [team, size] of sizes.entries()) {
    if (size < bestSize) {
      best = team;
      bestSize = size;
    }
  }
  return best;
}

/**
 * A colour (and spawn point) for a player arriving in `team`: `preferred` when no player of the
 * team holds it, else the lowest free one (S7-105). `except` leaves one member out of the count
 * (the player changing their own look).
 */
export function freeColorIndex(
  room: Pick<Room, 'members'>,
  team: TeamIndex,
  preferred: number | null,
  except?: string,
): number {
  return pickColor(takenColors(playersOf(room, team), team, except ?? null), preferred);
}

/** Every topic a member listens on: the room's, plus its team's (players) or the Widownia's. */
export function topicsFor(code: string, member: Pick<RoomMember, 'kind' | 'team'>): string[] {
  return [
    roomTopics.room(code),
    member.kind === 'player' ? roomTopics.team(code, member.team) : roomTopics.spectators(code),
  ];
}

/**
 * Moves a connected member's subscriptions from the topics it had (`before`) to the ones its kind
 * and team give now: for the team and kind switches of S7-80 and S7-81.
 */
export function syncTopics(
  code: string,
  member: Pick<RoomMember, 'kind' | 'team' | 'connection'>,
  before: readonly string[],
): void {
  const connection = member.connection;
  if (!connection) {
    return;
  }
  const after = topicsFor(code, member);
  for (const topic of before) {
    if (!after.includes(topic)) {
      connection.unsubscribe(topic);
    }
  }
  for (const topic of after) {
    if (!before.includes(topic)) {
      connection.subscribe(topic);
    }
  }
}

/**
 * Gives every player its team for the room's mode (co-op: team 0; versus: alternating in join
 * order, so the first joiner is in Kurier, the second in Głos) and its colour within that team:
 * in join order, each player takes their preferred colour when no earlier teammate holds it,
 * else the lowest free one (S7-105). Spectators keep their team, which co-op resets to 0.
 */
function assignTeams(room: Pick<Room, 'mode' | 'members'>): void {
  const taken = Array.from({ length: MAX_TEAMS }, () => new Set<number>());
  let index = 0;
  for (const member of room.members.values()) {
    if (member.kind !== 'player') {
      if (room.mode === 'coop') {
        member.team = 0;
      }
      continue;
    }
    const team = room.mode === 'versus' ? index % MAX_TEAMS : 0;
    index += 1;
    member.team = team;
    const used = taken[team] ?? new Set<number>();
    member.colorIndex = pickColor(used, member.preferredColor);
    used.add(member.colorIndex);
  }
}

/**
 * The versus level end of a newsroom: `won` means the match was won; no campaign stars. A loser
 * lost on credibility when its own ran out, otherwise on points; a draw has no loss reason.
 */
export function versusLevelOutcome(
  result: VersusResult,
  team: TeamIndex,
  credibility: number,
): LevelOutcome {
  const won = result.winnerTeam === team;
  if (won || result.winnerTeam === null) {
    return { won, stars: 0, lossReason: null };
  }
  return { won, stars: 0, lossReason: credibility <= 0 ? 'credibility' : 'score' };
}

/** Folds events into players' counters (`applyStatsEvent` is the only rule). */
function foldStats(stats: Map<string, PlayerStats>, events: readonly GameEvent[]): void {
  for (const event of events) {
    const playerId = 'playerId' in event ? event.playerId : null;
    const current = typeof playerId === 'string' ? stats.get(playerId) : undefined;
    if (current) {
      stats.set(current.playerId, applyStatsEvent(current, event));
    }
  }
}

/**
 * What a spectator event counts for in the Widownia's stats: a game event as itself, a revealed
 * verdict as the verdict it was, a masked one (or a revealed expiry) as nothing.
 */
function shownStatsEvent(event: SpectatorEvent): GameEvent | null {
  if (event.kind === 'verdictMasked') {
    return null;
  }
  if (event.kind === 'verdictRevealed') {
    const { playerId, verdict } = event.result;
    return playerId !== null && verdict !== null
      ? { ...event.result, kind: 'verdictResult', playerId, verdict }
      : null;
  }
  return event;
}

/** Fresh lobby newsrooms for the room's mode, without players. */
function freshTeams(room: Pick<Room, 'map' | 'mode'>): [TeamRun, ...TeamRun[]] {
  const run = (): TeamRun => ({ game: createGameState({ map: room.map }), forfeited: false });
  return room.mode === 'versus' ? [run(), run()] : [run()];
}

export function createRoomRegistry(options: RegistryOptions) {
  const { hub } = options;
  const now = options.now ?? (() => performance.now());
  const wallClock = options.wallClock ?? (() => Date.now());
  const random = options.random ?? secureRandom;
  const stepGame = options.step ?? step;
  const briefingMs = options.briefingMs ?? BRIEFING_DURATION_MS;
  const rooms = new Map<string, Room>();
  const memberships = new Map<string, Membership>();
  /** Reconnect token → exactly one member (and so one kind). */
  const tokens = new Map<string, Membership>();

  function send(connection: Connection, message: ServerMessage): void {
    connection.send(encodeMessage(message));
  }

  function sendError(connection: Connection, code: ErrorCode, detail?: string): void {
    send(
      connection,
      detail === undefined ? { type: 'error', code } : { type: 'error', code, detail },
    );
  }

  /** A fresh seed for a run or a sim (31-bit, like every seed the content and sim take). */
  function drawSeed(): number {
    return Math.floor(random() * 0x7fffffff);
  }

  /** The member of a connection or token, with its room. */
  function resolve(
    membership: Membership | undefined,
  ): { room: Room; member: RoomMember } | undefined {
    const room = membership ? rooms.get(membership.roomCode) : undefined;
    const member = membership ? room?.members.get(membership.memberId) : undefined;
    return room && member ? { room, member } : undefined;
  }

  /** Whether a feature flag of config.json is on now (the shared defaults without settings). */
  function featureOn(flag: FeatureFlag): boolean {
    return options.settings?.().features[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
  }

  function teamRun(room: Room, team: TeamIndex): TeamRun {
    return room.teams[team] ?? room.teams[0];
  }

  /**
   * Sets the room's level as `getLevel` serves it (a bag level's Normal preview, the endless
   * preview) and drops any dealt run; the briefing deals the real one (`prepareRoomRun`).
   */
  function setLevel(room: Room, level: Level): void {
    room.level = level;
    room.stories = storiesForLevel(level);
    room.map = parseLayout(level.layout);
    room.run = null;
  }

  /**
   * Deals the run the room is about to play (README §4): a new run seed, apart from the sim seed,
   * on the room's difficulty, always from the selected level's base so every replay differs.
   * Every newsroom of the room plays this one run.
   */
  function prepareRoomRun(room: Room): void {
    const seed = drawSeed();
    const run = prepareRun(
      requireLevel(room.level.id),
      { seed, difficulty: room.difficulty },
      LEVELS,
      STORIES,
    );
    room.level = run.level;
    room.stories = run.stories;
    room.map = parseLayout(run.level.layout);
    room.run = { seed, summary: runSummary(run) };
  }

  /** To everyone in the room (`roomState`, `gameStarted`). */
  function broadcast(room: Room, message: ServerMessage): void {
    hub.publish(roomTopics.room(room.code), encodeMessage(message));
  }

  function hasConnectedSpectator(room: Room): boolean {
    return spectatorsOf(room).some((m) => m.connection !== null);
  }

  /**
   * To one newsroom's players and, with `toSpectators` while a spectator is connected, to the
   * Widownia: encoded once, the same string on both topics.
   */
  function publishTeam(
    room: Room,
    team: TeamIndex,
    message: ServerMessage,
    toSpectators: boolean,
  ): void {
    const data = encodeMessage(message);
    hub.publish(roomTopics.team(room.code, team), data);
    if (toSpectators && hasConnectedSpectator(room)) {
      hub.publish(roomTopics.spectators(room.code), data);
    }
  }

  /**
   * A game event to its newsroom's players and, while the level is played, to the Widownia as a
   * `spectatorEvent` through the embargo. `before` is the team's sim before the step that made
   * the event (a resolved botRaid wave's folders are gone after it).
   */
  function publishTeamEvent(
    room: Room,
    team: TeamIndex,
    event: GameEvent,
    before: GameState = teamRun(room, team).game,
  ): void {
    publishTeam(
      room,
      team,
      { type: 'event', tick: teamRun(room, team).game.tick, team, event },
      false,
    );
    if (room.phase === 'playing') {
      feedSpectators(room, team, event, before);
    }
  }

  /**
   * One team event for the Widownia (S7-81). In versus the embargo turns a verdict or an expiry
   * into `verdictMasked` and then reveals every held result whose spawn key both newsrooms have
   * now closed; a resolved botRaid wave closes its other folders' keys as well, since the wave is
   * one result. The embargo and the shown counters move even with nobody watching, so a
   * spectator who arrives later is never shown an embargoed result.
   */
  function feedSpectators(room: Room, team: TeamIndex, event: GameEvent, before: GameState): void {
    const game = teamRun(room, team).game;
    const masked = maskForSpectators(room.embargo, team, event, game.results);
    room.embargo = masked.embargo;
    const items: SpectatorItem[] = [{ team, event: masked.event }];
    const closedKeys = masked.event.kind === 'verdictMasked' ? [masked.event.spawnKey] : [];
    if (room.embargo.teams > 1) {
      if (event.kind === 'folderSpawned') {
        const key = game.folders[event.folderId]?.spawnKey;
        if (key !== undefined) {
          room.embargo = openSpawnKey(room.embargo, team, key);
        }
      } else if (event.kind === 'raidResolved') {
        for (const folderId of event.folderIds) {
          const key = before.folders[folderId]?.spawnKey;
          if (key !== undefined) {
            room.embargo = closeSpawnKey(room.embargo, team, key);
            closedKeys.push(key);
          }
        }
      }
    }
    for (const key of closedKeys) {
      const released = release(room.embargo, key);
      room.embargo = released.embargo;
      items.push(...released.revealed);
    }
    showSpectators(room, game.tick, items);
  }

  /** Counts what the Widownia is shown and, while a spectator is connected, publishes it. */
  function showSpectators(room: Room, tick: number, items: readonly SpectatorItem[]): void {
    const live = hasConnectedSpectator(room);
    for (const item of items) {
      const shown = shownStatsEvent(item.event);
      if (shown) {
        foldStats(room.spectatorStats, [shown]);
      }
      if (live) {
        hub.publish(
          roomTopics.spectators(room.code),
          encodeMessage({ type: 'spectatorEvent', tick, team: item.team, event: item.event }),
        );
      }
    }
  }

  /** The Widownia's 1 Hz counters: what it was shown, and every newsroom's standing. */
  function matchStatsOf(room: Room): MatchStatsMessage {
    return {
      type: 'matchStats',
      tick: room.teams[0].game.tick,
      players: [...room.spectatorStats.values()].slice(0, MAX_ROOM_PLAYERS),
      teams: teamScoresOf(room),
    };
  }

  /**
   * A spectator arriving (or switching over) mid-level or at the results gets the current
   * picture at once: each newsroom's snapshot and the counters, plus each `levelEnd` at the
   * results. The briefing has nothing to show yet.
   */
  function syncSpectator(room: Room, connection: Connection): void {
    if (room.phase !== 'playing' && room.phase !== 'results') {
      return;
    }
    const scoreboard = scoreboardOf(room);
    room.teams.forEach((_, team) => {
      send(connection, snapshotOf(room, team, scoreboard));
    });
    send(connection, matchStatsOf(room));
    if (room.phase === 'results') {
      room.teams.forEach((_, team) => {
        send(connection, levelEndFor(room, team));
      });
    }
  }

  function broadcastRoomState(room: Room): void {
    broadcast(room, {
      type: 'roomState',
      roomCode: room.code,
      hostId: room.hostId,
      phase: room.phase,
      levelId: room.level.id,
      players: playersOf(room).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        colorIndex: p.colorIndex,
        connected: p.connection !== null,
        role: p.role,
        ready: p.ready,
        team: p.team,
        accessory: p.accessory,
      })),
      // Clients count the briefing down locally from `endsInMs`; it is re-sent with every
      // roomState (skip, join, reconnect), so there is no periodic broadcast.
      briefing: room.briefing
        ? {
            endsInMs: Math.max(0, room.briefing.endsAt - now()),
            skippedBy: [...room.briefing.skippedBy],
          }
        : null,
      blunderVotes: [...room.blunderVotes].map(([playerId, vote]) => ({
        playerId,
        storyId: vote.storyId,
      })),
      difficulty: room.difficulty,
      run: room.run ? { ...room.run.summary } : null,
      mode: room.mode,
      visibility: room.visibility,
      name: room.name,
      spectatorsAllowed: room.spectatorsAllowed,
      spectators: spectatorsOf(room).map((s) => ({
        id: s.id,
        nickname: s.nickname,
        connected: s.connection !== null,
      })),
    });
  }

  function attach(room: Room, member: RoomMember, connection: Connection): void {
    member.connection = connection;
    member.disconnectedAt = null;
    memberships.set(connection.id, { roomCode: room.code, memberId: member.id });
    for (const topic of topicsFor(room.code, member)) {
      connection.subscribe(topic);
    }
    send(connection, {
      type: 'welcome',
      playerId: member.id,
      roomCode: room.code,
      reconnectToken: member.reconnectToken,
    });
  }

  function addToRoom(
    room: Room,
    nickname: string,
    connection: Connection,
    kind: MemberKind,
    team: TeamIndex,
    clientId: ClientId | undefined,
    look: Look | undefined,
  ): RoomMember {
    const preferredColor = look?.color ?? null;
    const member: RoomMember = {
      id: `p${room.nextPlayerNumber++}`,
      kind,
      team,
      ...(clientId === undefined ? {} : { clientId }),
      nickname,
      colorIndex: kind === 'player' ? freeColorIndex(room, team, preferredColor) : 0,
      preferredColor,
      accessory: look?.accessory ?? 'none',
      reconnectToken: generateReconnectToken(),
      connection: null,
      disconnectedAt: null,
      inputQueue: [],
      lastQueuedSeq: -1,
      commandQueue: [],
      role: null,
      ready: false,
    };
    room.members.set(member.id, member);
    tokens.set(member.reconnectToken, { roomCode: room.code, memberId: member.id });
    if (room.phase === 'playing' && kind === 'player') {
      const run = teamRun(room, team);
      run.game = addPlayer(
        run.game,
        member.id,
        spawnPoint(room.map, member.colorIndex),
        member.role,
      );
      room.stats.set(member.id, emptyPlayerStats(member.id, team));
      room.spectatorStats.set(member.id, emptyPlayerStats(member.id, team));
    }
    attach(room, member, connection);
    return member;
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

    // A token resumes exactly its member, as the kind and team it has now; `as` is not read, so
    // one token can never be a player and a spectator at once.
    if (message.reconnectToken !== undefined) {
      reconnect(connection, message.reconnectToken);
      return;
    }

    if (message.as === 'spectator') {
      joinAsSpectator(connection, message);
      return;
    }

    if (message.roomCode === undefined) {
      createRoom(connection, message, 'player');
      return;
    }

    const room = rooms.get(message.roomCode);
    if (!room) {
      sendError(connection, 'roomNotFound');
      return;
    }
    if (inKickCooldown(room, message.clientId)) {
      sendError(connection, 'kickCooldown');
      return;
    }
    // A versus match keeps its line-up: a new player waits for the results (or spectates).
    if (room.mode === 'versus' && (room.phase === 'briefing' || room.phase === 'playing')) {
      sendError(connection, 'matchInProgress');
      return;
    }
    const team = pickTeam(room);
    if (team === null) {
      sendError(connection, 'roomFull');
      return;
    }
    const player = addToRoom(
      room,
      message.nickname,
      connection,
      'player',
      team,
      message.clientId,
      message.look,
    );
    // A shared co-op level never waits for one player's menu.
    room.paused = false;
    log.info('player joined', { room: room.code, player: player.id });
    publishTeamEvent(room, team, { kind: 'playerJoined', playerId: player.id });
    broadcastRoomState(room);
  }

  function reconnect(connection: Connection, token: string): void {
    const found = resolve(tokens.get(token));
    if (!found) {
      sendError(connection, 'reconnectFailed');
      return;
    }
    const { room, member } = found;
    const previous = member.connection;
    if (previous) {
      // Same member opened a second socket (e.g. a quick reload): the new one wins.
      memberships.delete(previous.id);
      for (const topic of topicsFor(room.code, member)) {
        previous.unsubscribe(topic);
      }
      previous.close(CLOSE_REPLACED, 'replaced');
    }
    attach(room, member, connection);
    // A reload comes back with the menu closed; a returning teammate shares the clock again.
    room.paused = false;
    log.info('player reconnected', { room: room.code, player: member.id });
    if (member.kind === 'player') {
      publishTeamEvent(room, member.team, { kind: 'playerReconnected', playerId: member.id });
    }
    broadcastRoomState(room);
    if (member.kind === 'spectator') {
      syncSpectator(room, connection);
    }
  }

  /**
   * A new room with the joiner as host. A spectator creates it with the Widownia open (a teacher
   * on a projector) and watches from the start.
   */
  function createRoom(connection: Connection, message: JoinMessage, kind: MemberKind): void {
    const settings = options.settings?.();
    if (rooms.size >= (options.maxRooms ?? settings?.maxRooms ?? MAX_ROOMS)) {
      log.warn('room limit reached', { rooms: rooms.size });
      sendError(connection, 'roomFull', 'server is busy');
      return;
    }
    const code = generateRoomCode(random, new Set(rooms.keys()));
    const level = requireLevel(DEFAULT_LEVEL_ID);
    const map = parseLayout(level.layout);
    const mode: RoomMode = 'coop';
    const room: Room = {
      code,
      hostId: '',
      phase: 'lobby',
      members: new Map(),
      teams: freshTeams({ map, mode }),
      level,
      stories: storiesForLevel(level),
      difficulty: settings?.defaultDifficulty ?? DEFAULT_DIFFICULTY,
      run: null,
      map,
      nextPlayerNumber: 1,
      briefing: null,
      blunderVotes: new Map(),
      paused: false,
      mode,
      visibility: 'private',
      name: null,
      spectatorsAllowed: kind === 'spectator',
      createdAt: wallClock(),
      stats: new Map(),
      spectatorStats: new Map(),
      outcome: null,
      embargo: createEmbargo(1),
      kicked: new Map(),
    };
    rooms.set(code, room);
    const host = addToRoom(
      room,
      message.nickname,
      connection,
      kind,
      0,
      message.clientId,
      message.look,
    );
    room.hostId = host.id;
    log.info('room created', { room: code, player: host.id, kind });
    broadcastRoomState(room);
    options.onActive?.();
  }

  /**
   * Joins the Widownia (S7-81): in any phase and mode, while the spectators flag is on and the
   * room's Widownia is open, up to `MAX_SPECTATORS`. Without a code it creates a room hosted by
   * the spectator. Players are not interrupted: no `playerJoined`, only the roomState list.
   */
  function joinAsSpectator(connection: Connection, message: JoinMessage): void {
    if (!featureOn('spectators')) {
      sendError(connection, 'featureDisabled', 'spectators are not available');
      return;
    }
    if (message.roomCode === undefined) {
      createRoom(connection, message, 'spectator');
      return;
    }
    const room = rooms.get(message.roomCode);
    if (!room) {
      sendError(connection, 'roomNotFound');
      return;
    }
    if (inKickCooldown(room, message.clientId)) {
      sendError(connection, 'kickCooldown');
      return;
    }
    if (!room.spectatorsAllowed) {
      sendError(connection, 'spectatorsOff');
      return;
    }
    if (spectatorsOf(room).length >= MAX_SPECTATORS) {
      sendError(connection, 'spectatorsFull');
      return;
    }
    const spectator = addToRoom(
      room,
      message.nickname,
      connection,
      'spectator',
      0,
      message.clientId,
      message.look,
    );
    // The solo pause is for a room nobody else is in.
    room.paused = false;
    log.info('spectator joined', { room: room.code, player: spectator.id });
    broadcastRoomState(room);
    syncSpectator(room, connection);
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
        const found = resolve(memberships.get(connection.id));
        if (!found) {
          sendError(connection, 'notInRoom');
          return;
        }
        const { room, member } = found;
        if (message.type === 'lobby') {
          handleLobby(room, member, message.action);
        } else if (message.type === 'command') {
          enqueueCommand(room, member, message.command);
        } else {
          enqueueInput(room, member, message);
        }
        return;
      }
    }
  }

  function rejectNotHost(member: RoomMember): void {
    if (member.connection) {
      sendError(member.connection, 'notHost');
    }
  }

  function handleLobby(room: Room, member: RoomMember, action: LobbyAction): void {
    if (member.kind === 'spectator' && PLAYER_ACTIONS.has(action.kind)) {
      return;
    }
    switch (action.kind) {
      case 'start': {
        if (member.id !== room.hostId) {
          rejectNotHost(member);
          return;
        }
        // Start works from the lobby and, as a replay, straight from the results screen. The
        // same ready gate applies in both phases (readiness may be toggled during results too).
        if (room.phase === 'playing' || room.phase === 'briefing') {
          return;
        }
        const waitingFor = notReadyPlayers(room);
        if (waitingFor.length > 0) {
          if (member.connection) {
            sendError(member.connection, 'notReady', `waiting for ${waitingFor.join(', ')}`);
          }
          return;
        }
        const empty = emptyTeam(room);
        if (empty !== null) {
          if (member.connection) {
            sendError(member.connection, 'teamEmpty', `team ${empty}`);
          }
          return;
        }
        beginBriefing(room);
        return;
      }
      case 'setRole':
        // Roles are non-exclusive; they are fixed from the briefing to the end of the level.
        if (room.phase === 'playing' || room.phase === 'briefing') {
          return;
        }
        member.role = action.role;
        broadcastRoomState(room);
        return;
      case 'setReady':
        // Allowed in `results` as well so a direct replay can pass the ready gate.
        if (room.phase === 'playing' || room.phase === 'briefing') {
          return;
        }
        member.ready = action.ready;
        broadcastRoomState(room);
        return;
      case 'selectLevel': {
        if (member.id !== room.hostId) {
          rejectNotHost(member);
          return;
        }
        const level = getLevel(action.levelId);
        if (!level) {
          if (member.connection) {
            sendError(member.connection, 'unknownLevel');
          }
          return;
        }
        if (room.phase !== 'lobby') {
          return;
        }
        setLevel(room, level);
        room.teams = freshTeams(room);
        // Every (re)selection asks players to confirm again, so nobody is ready for a level
        // they have not seen.
        resetReady(room);
        broadcastRoomState(room);
        return;
      }
      case 'skipBriefing':
        if (!room.briefing || room.briefing.skippedBy.has(member.id)) {
          return;
        }
        room.briefing.skippedBy.add(member.id);
        if (!finishBriefingIfAllSkipped(room)) {
          broadcastRoomState(room);
        }
        return;
      case 'voteBlunder':
        voteBlunder(room, member, action.storyId);
        return;
      case 'setPaused':
        setPaused(room, action.paused);
        return;
      case 'setDifficulty':
        if (member.id !== room.hostId) {
          rejectNotHost(member);
          return;
        }
        if (room.phase !== 'lobby') {
          return;
        }
        room.difficulty = action.difficulty;
        // Like a level change: nobody stays ready for a difficulty they have not seen.
        resetReady(room);
        broadcastRoomState(room);
        return;
      case 'setMode':
        setMode(room, member, action.mode);
        return;
      case 'setTeam':
        setTeam(room, member, action.team, action.playerId);
        return;
      case 'setSpectator':
        setSpectator(room, member, action.spectator, action.playerId);
        return;
      case 'setSpectatorsAllowed':
        setSpectatorsAllowed(room, member, action.allowed);
        return;
      case 'setVisibility':
        setVisibility(room, member, action.visibility);
        return;
      case 'setRoomName':
        setRoomName(room, member, action.name);
        return;
      case 'kick':
        kick(room, member, action.playerId);
        return;
      case 'transferHost':
        transferHost(room, member, action.playerId);
        return;
      case 'setLook':
        setLook(room, member, action.look);
        return;
      case 'backToLobby':
        if (member.id !== room.hostId) {
          rejectNotHost(member);
          return;
        }
        if (room.phase !== 'results') {
          return;
        }
        room.phase = 'lobby';
        room.blunderVotes.clear();
        // Drop the finished run; the lobby shows the selected level again and the next start
        // deals a new run and builds fresh newsrooms.
        setLevel(room, requireLevel(room.level.id));
        room.teams = freshTeams(room);
        room.outcome = null;
        for (const m of room.members.values()) {
          m.inputQueue = [];
          m.lastQueuedSeq = -1;
          m.commandQueue = [];
        }
        resetReady(room);
        broadcastRoomState(room);
        return;
    }
  }

  function reject(member: RoomMember, code: ErrorCode, detail?: string): void {
    if (member.connection) {
      sendError(member.connection, code, detail);
    }
  }

  /**
   * Host, lobby only: switches between co-op and versus. Versus deals the players into the two
   * newsrooms alternately in join order; back to co-op needs at most one newsroom of players.
   * Every member's topics follow its team, the newsrooms are rebuilt and nobody stays ready.
   */
  function setMode(room: Room, member: RoomMember, mode: RoomMode): void {
    if (member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    if (room.phase !== 'lobby' || room.mode === mode) {
      return;
    }
    if (mode === 'versus' && !featureOn('versus')) {
      reject(member, 'featureDisabled', 'versus is not available');
      return;
    }
    if (mode === 'coop' && playersOf(room).length > MAX_TEAM_PLAYERS) {
      reject(member, 'teamFull', `${MAX_TEAM_PLAYERS} players at most`);
      return;
    }
    const before = new Map(
      [...room.members.values()].map((m) => [m.id, topicsFor(room.code, m)] as const),
    );
    room.mode = mode;
    assignTeams(room);
    room.teams = freshTeams(room);
    room.embargo = createEmbargo(room.teams.length);
    for (const m of room.members.values()) {
      syncTopics(room.code, m, before.get(m.id) ?? []);
    }
    resetReady(room);
    log.info('room mode changed', { room: room.code, mode });
    broadcastRoomState(room);
  }

  /**
   * Lobby only (S7-105): a member's profile look changed. The preference is kept for later team
   * moves; a player takes the colour now when no teammate holds it (else keeps the current one,
   * with no error), and the accessory always applies. Ignored in the briefing, while playing
   * and on the results screen, so a look never changes mid-run.
   */
  function setLook(room: Room, member: RoomMember, look: Look): void {
    if (room.phase !== 'lobby') {
      return;
    }
    const before = { colorIndex: member.colorIndex, accessory: member.accessory };
    member.preferredColor = look.color;
    member.accessory = look.accessory;
    if (member.kind === 'player' && look.color !== null) {
      const taken = takenColors(playersOf(room, member.team), member.team, member.id);
      if (!taken.has(look.color)) {
        member.colorIndex = look.color;
      }
    }
    // Only a change the wire shows sends a roomState (not a spectator's look, not a kept colour).
    if (
      member.kind === 'player' &&
      (member.colorIndex !== before.colorIndex || member.accessory !== before.accessory)
    ) {
      broadcastRoomState(room);
    }
  }

  /**
   * Versus, lobby or results: a player moves to the other newsroom (the host may move anyone)
   * and takes the lowest free colour there.
   */
  function setTeam(
    room: Room,
    member: RoomMember,
    team: TeamIndex,
    playerId: string | undefined,
  ): void {
    if (room.mode !== 'versus' || (room.phase !== 'lobby' && room.phase !== 'results')) {
      return;
    }
    const targetId = playerId ?? member.id;
    if (targetId !== member.id && member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    const target = room.members.get(targetId);
    if (target?.kind !== 'player') {
      reject(member, 'invalidTarget');
      return;
    }
    if (target.team === team) {
      return;
    }
    if (playersOf(room, team).length >= MAX_TEAM_PLAYERS) {
      reject(member, 'teamFull');
      return;
    }
    const before = topicsFor(room.code, target);
    target.colorIndex = freeColorIndex(room, team, target.preferredColor);
    target.team = team;
    syncTopics(room.code, target, before);
    broadcastRoomState(room);
  }

  /**
   * Host, any phase: opens or closes the Widownia. Opening it needs the spectators flag;
   * closing it keeps the spectators already watching.
   */
  function setSpectatorsAllowed(room: Room, member: RoomMember, allowed: boolean): void {
    if (member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    if (allowed && !featureOn('spectators')) {
      reject(member, 'featureDisabled', 'spectators are not available');
      return;
    }
    if (room.spectatorsAllowed === allowed) {
      return;
    }
    room.spectatorsAllowed = allowed;
    broadcastRoomState(room);
  }

  /**
   * Lobby or results: a member moves between playing and watching (the host may move anyone).
   * To the Widownia needs the spectators flag, a free seat and, for a guest moving themselves,
   * an open Widownia; the player's team is kept for the way back. Back to playing takes the
   * kept team when it has a seat, else `pickTeam`, and the lowest free colour there.
   */
  function setSpectator(
    room: Room,
    member: RoomMember,
    spectator: boolean,
    playerId: string | undefined,
  ): void {
    if (room.phase !== 'lobby' && room.phase !== 'results') {
      return;
    }
    const targetId = playerId ?? member.id;
    if (targetId !== member.id && member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    const target = room.members.get(targetId);
    if (!target) {
      reject(member, 'invalidTarget');
      return;
    }
    if ((target.kind === 'spectator') === spectator) {
      return;
    }
    const before = topicsFor(room.code, target);
    if (spectator) {
      if (!featureOn('spectators')) {
        reject(member, 'featureDisabled', 'spectators are not available');
        return;
      }
      if (!room.spectatorsAllowed && member.id !== room.hostId) {
        reject(member, 'spectatorsOff');
        return;
      }
      if (spectatorsOf(room).length >= MAX_SPECTATORS) {
        reject(member, 'spectatorsFull');
        return;
      }
      target.kind = 'spectator';
      target.colorIndex = 0;
      // A spectator holds no vote in the results.
      room.blunderVotes.delete(target.id);
    } else {
      const kept =
        target.team < teamTotal(room) && playersOf(room, target.team).length < MAX_TEAM_PLAYERS
          ? target.team
          : null;
      const team = kept ?? pickTeam(room);
      if (team === null) {
        reject(member, 'teamFull');
        return;
      }
      target.colorIndex = freeColorIndex(room, team, target.preferredColor);
      target.team = team;
      target.kind = 'player';
    }
    target.ready = false;
    syncTopics(room.code, target, before);
    log.info(spectator ? 'member now spectating' : 'member now playing', {
      room: room.code,
      player: target.id,
    });
    broadcastRoomState(room);
    if (spectator && target.connection) {
      syncSpectator(room, target.connection);
    }
  }

  /**
   * Host, any phase: private (reached by code) or public (listed in the room browser). Public
   * needs the `roomBrowser` flag; a room already public stays so if the flag goes off later.
   */
  function setVisibility(room: Room, member: RoomMember, visibility: RoomVisibility): void {
    if (member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    if (visibility === 'public' && !featureOn('roomBrowser')) {
      reject(member, 'featureDisabled', 'the room browser is not available');
      return;
    }
    if (room.visibility === visibility) {
      return;
    }
    room.visibility = visibility;
    log.info('room visibility changed', { room: room.code, visibility });
    broadcastRoomState(room);
  }

  /**
   * Host, any phase: names the room (the schema already trimmed it) or clears the name with
   * null. A name the shared filter blocks gets `invalidName` and changes nothing.
   */
  function setRoomName(room: Room, member: RoomMember, name: string | null): void {
    if (member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    if (name !== null && !isAcceptableName(name)) {
      reject(member, 'invalidName');
      return;
    }
    if (room.name === name) {
      return;
    }
    room.name = name;
    broadcastRoomState(room);
  }

  /** Whether `clientId` was kicked from the room less than `KICK_REJOIN_COOLDOWN_MS` ago. */
  function inKickCooldown(room: Room, clientId: ClientId | undefined): boolean {
    if (clientId === undefined) {
      return false;
    }
    const until = room.kicked.get(clientId);
    if (until === undefined) {
      return false;
    }
    if (now() >= until) {
      room.kicked.delete(clientId);
      return false;
    }
    return true;
  }

  /**
   * Host, any phase, never self: the target gets `error kicked`, leaves the room for good (its
   * token is dropped, so a reconnect gets `reconnectFailed`) and its socket closes with
   * `CLOSE_KICKED`. Its browser (`clientId`) may not rejoin for `KICK_REJOIN_COOLDOWN_MS`; there
   * is no IP ban, since a whole class shares one address.
   */
  function kick(room: Room, member: RoomMember, playerId: string): void {
    if (member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    const target = room.members.get(playerId);
    if (!target || target.id === member.id) {
      reject(member, 'invalidTarget');
      return;
    }
    const time = now();
    for (const [clientId, until] of room.kicked) {
      if (time >= until) {
        room.kicked.delete(clientId);
      }
    }
    if (target.clientId !== undefined) {
      room.kicked.set(target.clientId, time + KICK_REJOIN_COOLDOWN_MS);
    }
    const connection = target.connection;
    if (connection) {
      sendError(connection, 'kicked');
    }
    log.info('member kicked', { room: room.code, player: target.id });
    removeMember(room, target);
    connection?.close(CLOSE_KICKED, 'kicked');
  }

  /** Host, any phase: hands the host to another connected member (a spectator may host). */
  function transferHost(room: Room, member: RoomMember, playerId: string): void {
    if (member.id !== room.hostId) {
      rejectNotHost(member);
      return;
    }
    const target = room.members.get(playerId);
    if (!target || target.id === member.id || target.connection === null) {
      reject(member, 'invalidTarget');
      return;
    }
    room.hostId = target.id;
    log.info('host transferred', { room: room.code, player: target.id });
    broadcastRoomState(room);
  }

  /** The first newsroom of the mode without a connected player, or null when all have one. */
  function emptyTeam(room: Room): TeamIndex | null {
    for (let team = 0; team < teamTotal(room); team++) {
      if (!playersOf(room, team).some((p) => p.connection !== null)) {
        return team;
      }
    }
    return null;
  }

  /**
   * The in-game menu pauses a solo level (S7-10): only while playing a co-op room with exactly
   * one connected player and no connected spectator (a versus clock never stops; a watched match
   * does not wait for a menu). Resuming is always accepted. Anything else is ignored, like other
   * out-of-phase actions.
   */
  function setPaused(room: Room, paused: boolean): void {
    if (
      paused &&
      (room.phase !== 'playing' ||
        room.mode !== 'coop' ||
        connectedPlayerCount(room) !== 1 ||
        hasConnectedSpectator(room))
    ) {
      return;
    }
    if (room.paused === paused) {
      return;
    }
    room.paused = paused;
    log.info(paused ? 'room paused' : 'room resumed', { room: room.code });
    // The tick that skips a paused room sends nothing, so the flag goes out now.
    publishSnapshots(room, false);
  }

  function connectedPlayerCount(room: Room): number {
    return playersOf(room).filter((p) => p.connection !== null).length;
  }

  /** Nicknames of connected non-host players who have not pressed ready. The host is
   * implicitly ready by pressing start; disconnected players never block the start. */
  function notReadyPlayers(room: Room): string[] {
    return playersOf(room)
      .filter((p) => p.id !== room.hostId && p.connection !== null && !p.ready)
      .map((p) => p.nickname);
  }

  function resetReady(room: Room): void {
    for (const m of room.members.values()) {
      m.ready = false;
    }
  }

  /**
   * Start (from the lobby or as a replay from results) opens the briefing first, which deals the
   * run, so every attempt plays a new one.
   */
  function beginBriefing(room: Room): void {
    prepareRoomRun(room);
    room.phase = 'briefing';
    room.briefing = { endsAt: now() + briefingMs, skippedBy: new Set() };
    room.blunderVotes.clear();
    resetReady(room);
    log.info('briefing started', {
      room: room.code,
      level: room.level.id,
      difficulty: room.difficulty,
    });
    broadcastRoomState(room);
  }

  /**
   * Starts the level once every connected player has skipped the briefing. Disconnected
   * players never hold it up (the timer still runs for an empty room). Returns true when the
   * level started.
   */
  function finishBriefingIfAllSkipped(room: Room): boolean {
    const briefing = room.briefing;
    if (!briefing) {
      return false;
    }
    const connected = playersOf(room).filter((p) => p.connection !== null);
    if (connected.length === 0 || !connected.every((p) => briefing.skippedBy.has(p.id))) {
      return false;
    }
    startLevel(room);
    return true;
  }

  function voteBlunder(room: Room, member: RoomMember, storyId: string): void {
    if (room.phase !== 'results') {
      return;
    }
    if (!teamRun(room, member.team).game.results.some((r) => r.storyId === storyId)) {
      if (member.connection) {
        sendError(member.connection, 'invalidMessage', `story ${storyId} is not in this run`);
      }
      return;
    }
    const previous = room.blunderVotes.get(member.id);
    if (previous?.storyId === storyId) {
      return;
    }
    let rowId: number | null = previous?.rowId ?? null;
    if (options.recordBlunderVote) {
      try {
        rowId = options.recordBlunderVote({ levelId: room.level.id, storyId, previousId: rowId });
      } catch (error) {
        // A failed write must not break the debrief; the vote still shows in the room.
        log.error('blunder vote not stored', { room: room.code, error: String(error) });
      }
    }
    room.blunderVotes.set(member.id, { storyId, rowId });
    broadcastRoomState(room);
  }

  /**
   * The level starts in every newsroom at once: one sim seed for the match (the run, endless
   * included, was dealt at the briefing and is shared), each team's players at their spawns. A
   * versus newsroom whose players all left during the briefing starts forfeited.
   */
  function startLevel(room: Room): void {
    room.phase = 'playing';
    room.briefing = null;
    room.paused = false;
    const seed = drawSeed();
    const build = (team: TeamIndex): TeamRun => {
      let game = createGameState({ map: room.map, seed });
      const players = playersOf(room, team);
      for (const p of players) {
        game = addPlayer(game, p.id, spawnPoint(room.map, p.colorIndex), p.role);
      }
      return { game, forfeited: room.mode === 'versus' && players.length === 0 };
    };
    room.teams = teamTotal(room) > 1 ? [build(0), build(1)] : [build(0)];
    room.stats = new Map(playersOf(room).map((p) => [p.id, emptyPlayerStats(p.id, p.team)]));
    room.spectatorStats = new Map(room.stats);
    room.outcome = null;
    room.embargo = createEmbargo(room.teams.length);
    for (const m of room.members.values()) {
      m.inputQueue = [];
      m.lastQueuedSeq = -1;
      m.commandQueue = [];
      m.ready = false;
    }
    log.info('game started', { room: room.code, level: room.level.id });
    broadcast(room, {
      type: 'event',
      tick: room.teams[0].game.tick,
      event: { kind: 'gameStarted' },
    });
    broadcastRoomState(room);
  }

  function enqueueCommand(room: Room, member: RoomMember, command: PlayerCommand): void {
    if (
      member.kind !== 'player' ||
      room.phase !== 'playing' ||
      member.commandQueue.length >= COMMAND_QUEUE_MAX
    ) {
      return;
    }
    member.commandQueue.push(command);
  }

  function enqueueInput(room: Room, member: RoomMember, input: PlayerInput): void {
    if (member.kind !== 'player' || room.phase !== 'playing' || input.seq <= member.lastQueuedSeq) {
      return;
    }
    member.lastQueuedSeq = input.seq;
    member.inputQueue.push({ seq: input.seq, move: input.move, actions: input.actions });
    if (member.inputQueue.length > INPUT_QUEUE_MAX) {
      member.inputQueue.splice(0, member.inputQueue.length - INPUT_QUEUE_MAX);
    }
  }

  /** Drops a member for good: its token, its topics and (a player) its place in the sim. */
  function removeMember(room: Room, member: RoomMember): void {
    room.members.delete(member.id);
    tokens.delete(member.reconnectToken);
    if (member.connection) {
      memberships.delete(member.connection.id);
      for (const topic of topicsFor(room.code, member)) {
        member.connection.unsubscribe(topic);
      }
    }
    if (member.kind === 'player') {
      const run = teamRun(room, member.team);
      run.game = removeSimPlayer(run.game, member.id);
      // The last player of a versus newsroom gone for good (left, or the grace ran out): the
      // match is lost by forfeit, which the match rules settle at the next step.
      if (
        room.mode === 'versus' &&
        room.phase === 'playing' &&
        playersOf(room, member.team).length === 0
      ) {
        run.forfeited = true;
      }
    }
    room.briefing?.skippedBy.delete(member.id);
    // A stored vote stays counted; it just leaves the room's list with its player.
    room.blunderVotes.delete(member.id);
    log.info('player left', { room: room.code, player: member.id });
    if (room.members.size === 0) {
      rooms.delete(room.code);
      log.info('room closed', { room: room.code });
      return;
    }
    if (room.hostId === member.id) {
      reassignHost(room);
    }
    if (member.kind === 'player') {
      publishTeamEvent(room, member.team, { kind: 'playerLeft', playerId: member.id });
    }
    if (!finishBriefingIfAllSkipped(room)) {
      broadcastRoomState(room);
    }
  }

  /** A connected player first, then a connected spectator, then anyone. */
  function reassignHost(room: Room): void {
    const members = [...room.members.values()];
    const next =
      members.find((m) => m.kind === 'player' && m.connection !== null) ??
      members.find((m) => m.connection !== null) ??
      members[0];
    if (next) {
      room.hostId = next.id;
    }
  }

  /** Called when a socket closes. `intentional` = the client left on purpose (close code 1000). */
  function handleDisconnect(connection: Connection, intentional: boolean): void {
    const membership = memberships.get(connection.id);
    memberships.delete(connection.id);
    const found = resolve(membership);
    if (!found || found.member.connection?.id !== connection.id) {
      return;
    }
    const { room, member } = found;
    if (intentional) {
      removeMember(room, member);
      return;
    }
    member.connection = null;
    member.disconnectedAt = now();
    member.inputQueue = [];
    member.commandQueue = [];
    if (room.hostId === member.id) {
      reassignHost(room);
    }
    log.info('player disconnected', { room: room.code, player: member.id });
    if (!finishBriefingIfAllSkipped(room)) {
      broadcastRoomState(room);
    }
  }

  /** Advances every room by one tick: expires slots, steps the simulation, sends snapshots. */
  function tick(): void {
    const time = now();
    for (const room of [...rooms.values()]) {
      for (const member of [...room.members.values()]) {
        if (member.disconnectedAt !== null && time - member.disconnectedAt >= RECONNECT_GRACE_MS) {
          removeMember(room, member);
        }
      }
      if (!rooms.has(room.code)) {
        continue;
      }
      if (room.briefing && time >= room.briefing.endsAt) {
        startLevel(room);
        // The first simulation step runs on the next tick, as after a lobby start.
        continue;
      }
      if (room.phase !== 'playing') {
        continue;
      }
      if (room.paused) {
        // The world waits for the menu. Input sent meanwhile is stale (the client sends none
        // while paused); queued decisions wait for the resume.
        for (const player of playersOf(room)) {
          player.inputQueue = [];
        }
        continue;
      }
      stepRoom(room);
    }
  }

  /**
   * One lockstep tick of every newsroom: the same context (tuning, absent players) for each,
   * every team stepped before anything is published, then each team's events and snapshot.
   */
  function stepRoom(room: Room): void {
    const inputs = room.teams.map((): Record<string, PlayerInput[]> => ({}));
    const commands = room.teams.map((): QueuedCommand[] => []);
    for (const player of playersOf(room)) {
      const teamInputs = inputs[player.team];
      const teamCommands = commands[player.team];
      if (!teamInputs || !teamCommands) {
        continue;
      }
      // One input per tick keeps the server in lockstep with client prediction; a queue that
      // grew from network jitter is drained one extra input per tick.
      const count = player.inputQueue.length > INPUT_QUEUE_CATCH_UP_THRESHOLD ? 2 : 1;
      teamInputs[player.id] = player.inputQueue.splice(0, count);
      for (const command of player.commandQueue.splice(0)) {
        teamCommands.push({ playerId: player.id, command });
      }
    }
    const absent = absentPlayerIds(playersOf(room));
    const ctx: SimContext = {
      dtMs: TICK_MS,
      map: room.map,
      level: room.level,
      stories: room.stories,
      tuning: simTuning(room.difficulty),
      ...(absent ? { absent } : {}),
      // Versus anti-cheat: a scripted instant answer counts as a failure (off in co-op).
      ...(room.mode === 'versus' ? { minSolveMs: MINIGAME_MIN_SOLVE_MS } : {}),
    };
    const stepped = room.teams.map((run, team) => {
      const before = run.game;
      const result = stepGame(before, inputs[team] ?? {}, commands[team] ?? [], ctx);
      run.game = result.state;
      foldStats(room.stats, result.events);
      return { before, events: result.events };
    });
    stepped.forEach(({ before, events }, team) => {
      for (const event of events) {
        publishTeamEvent(room, team, event, before);
      }
    });
    const stepTick = room.teams[0].game.tick;
    publishSnapshots(room, stepTick % SPECTATOR_SNAPSHOT_INTERVAL_TICKS === 0);
    if (stepTick % SPECTATOR_STATS_INTERVAL_TICKS === 0 && hasConnectedSpectator(room)) {
      hub.publish(roomTopics.spectators(room.code), encodeMessage(matchStatsOf(room)));
    }
    if (room.mode === 'versus') {
      // The match rules decide every tick: credibility, forfeit, time (600 s in endless).
      room.outcome = matchOutcome(room);
      if (room.outcome) {
        endLevel(room);
      }
    } else if (room.teams[0].game.ended !== null) {
      endLevel(room);
    }
  }

  /** Match time: the newsrooms step in lockstep, so this is any running one's level time. */
  function matchElapsedMs(room: Room): number {
    return Math.max(...room.teams.map((run) => run.game.elapsedMs));
  }

  function standingsOf(room: Room): TeamStanding[] {
    return room.teams.map((run, team) => ({
      team,
      score: run.game.score,
      credibility: run.game.credibility,
      forfeited: run.forfeited,
    }));
  }

  /**
   * The versus result now, or null while the match goes on. Should every newsroom's sim have
   * ended without the match rules deciding, the score decides.
   */
  function matchOutcome(room: Room): VersusResult | null {
    const standings = standingsOf(room);
    const result = versusOutcome(standings, matchElapsedMs(room), matchDurationMs(room.level));
    if (result) {
      return result;
    }
    return room.teams.every((run) => run.game.ended !== null) ? byScore(standings) : null;
  }

  /** Every newsroom's standing (connected = its connected players). */
  function teamScoresOf(room: Room): TeamScore[] {
    return room.teams.map((run, team) =>
      teamScoreOf(
        run.game,
        team,
        playersOf(room, team).filter((p) => p.connection !== null).length,
      ),
    );
  }

  /** Both newsrooms' standings for versus snapshots and `levelEnd`; undefined in co-op. */
  function scoreboardOf(room: Room): TeamScore[] | undefined {
    return room.mode === 'versus' ? teamScoresOf(room) : undefined;
  }

  function publishSnapshots(room: Room, toSpectators: boolean): void {
    const scoreboard = scoreboardOf(room);
    room.teams.forEach((_, team) => {
      publishTeam(room, team, snapshotOf(room, team, scoreboard), toSpectators);
    });
  }

  /**
   * One newsroom's snapshot, tagged with its team. Versus adds the scoreboard and counts the
   * match time down (endless included, `VERSUS.endlessDurationS`).
   */
  function snapshotOf(room: Room, team: TeamIndex, scoreboard?: TeamScore[]): SnapshotMessage {
    const game = teamRun(room, team).game;
    const schedule = { level: room.level, stories: room.stories, map: room.map };
    return {
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
      timeLeftMs:
        room.mode === 'versus'
          ? Math.max(0, matchDurationMs(room.level) - game.elapsedMs)
          : timeLeftMs(game, room.level.durationS),
      score: game.score,
      credibility: game.credibility,
      folders: Object.values(game.folders),
      stations: Object.values(game.stations),
      desks: Object.values(game.desks),
      nextFolder: nextScheduledSpawn(game, schedule),
      conveyorFull: conveyorBlocked(game, schedule),
      crew: crewSnapshot(game),
      paused: room.paused,
      team,
      ...(scoreboard ? { scoreboard } : {}),
    };
  }

  function recordEndlessRun(room: Room, survivedS: number): void {
    if (!options.recordLeaderboardEntry) {
      return;
    }
    try {
      options.recordLeaderboardEntry({
        roomCode: room.code,
        players: playersOf(room).map((p) => p.nickname),
        score: room.teams[0].game.score,
        survivedS,
        difficulty: room.difficulty,
      });
    } catch (error) {
      // A failed write must not break the results screen.
      log.error('leaderboard entry not stored', { room: room.code, error: String(error) });
    }
  }

  /** The played run's best score (a level always passes the briefing, which deals the run). */
  function runMaxScore(room: Room): number {
    return (
      room.run?.summary.maxScore ?? maxLevelScore(room.level, new Map(Object.entries(room.stories)))
    );
  }

  function survivedSOf(game: GameState): number {
    return Math.floor(game.elapsedMs / 1000);
  }

  /**
   * One newsroom's `levelEnd`. Co-op sends exactly what it always did; versus tags the team and
   * adds the match summary (with the rival's results, which pair with ours by spawn key) and
   * every player's stats.
   */
  function levelEndFor(room: Room, team: TeamIndex): LevelEndMessage {
    const game = teamRun(room, team).game;
    const outcome = game.ended ?? { won: false, stars: 0, lossReason: null };
    const endless = room.level.id === ENDLESS_LEVEL_ID;
    const base = {
      type: 'levelEnd',
      levelId: room.level.id,
      difficulty: room.difficulty,
      won: outcome.won,
      stars: outcome.stars,
      score: game.score,
      credibility: game.credibility,
      results: game.results.slice(-ENDLESS.maxResultsSent),
      lossReason: outcome.lossReason,
      starThresholds: endless ? null : { ...room.level.stars },
      maxScore: endless ? null : runMaxScore(room),
      ...(endless ? { survivedS: survivedSOf(game) } : {}),
    } satisfies LevelEndMessage;
    const result = room.outcome;
    if (room.mode !== 'versus' || !result) {
      return base;
    }
    const scoreboard = scoreboardOf(room) ?? [];
    const rival = teamRun(room, team === 0 ? 1 : 0).game;
    return {
      ...base,
      team,
      stats: [...room.stats.values()].slice(0, MAX_ROOM_PLAYERS),
      versus: {
        winnerTeam: result.winnerTeam,
        reason: result.reason,
        teams: scoreboard,
        rivalResults: rival.results.slice(-ENDLESS.maxResultsSent),
      },
    };
  }

  /**
   * Closes a versus newsroom the match rules ended before its own sim did (the rival's
   * credibility or forfeit, endless time): its outcome follows the match, and every folder still
   * in play is recorded as unfinished, as at a level's own end.
   */
  function closeVersusGame(room: Room, team: TeamIndex, result: VersusResult): void {
    const run = teamRun(room, team);
    const game = run.game;
    const ended = versusLevelOutcome(result, team, game.credibility);
    const unfinished =
      game.ended === null ? unfinishedResults(Object.values(game.folders), room.stories) : [];
    run.game = { ...game, ended, results: [...game.results, ...unfinished] };
  }

  function endLevel(room: Room): void {
    const result = room.outcome;
    if (room.mode === 'versus' && result) {
      room.teams.forEach((_, team) => {
        closeVersusGame(room, team, result);
      });
    }
    const game = room.teams[0].game;
    // The level is over: the Widownia gets every result still held, before the level ends.
    const flushed = releaseAll(room.embargo);
    room.embargo = flushed.embargo;
    showSpectators(room, game.tick, flushed.revealed);
    const outcome = game.ended ?? { won: false, stars: 0, lossReason: null };
    room.phase = 'results';
    log.info('level ended', {
      room: room.code,
      level: room.level.id,
      ...outcome,
      ...(result ? { winnerTeam: result.winnerTeam, reason: result.reason } : {}),
    });
    // Versus is never a leaderboard run (nor campaign progress, which the client skips).
    if (room.level.id === ENDLESS_LEVEL_ID && room.mode === 'coop') {
      recordEndlessRun(room, survivedSOf(game));
    }
    room.teams.forEach((_, team) => {
      publishTeam(room, team, levelEndFor(room, team), true);
    });
    broadcastRoomState(room);
  }

  /**
   * The room browser's view of a room (S7-83), or null when it is not listed: private, or nobody
   * is connected (every member is inside the reconnect grace). The host nickname is masked.
   */
  function summaryOf(room: Room): RoomSummary | null {
    const host = room.members.get(room.hostId);
    const anyoneConnected = [...room.members.values()].some((m) => m.connection !== null);
    if (room.visibility !== 'public' || !host || !anyoneConnected) {
      return null;
    }
    const players = playersOf(room).length;
    const spectators = spectatorsOf(room).length;
    const maxPlayers = room.mode === 'versus' ? MAX_ROOM_PLAYERS : MAX_TEAM_PLAYERS;
    const spectatorsAllowed = room.spectatorsAllowed && featureOn('spectators');
    return {
      code: room.code,
      name: room.name,
      hostNickname: maskName(host.nickname),
      levelId: room.level.id,
      mode: room.mode,
      difficulty: room.difficulty,
      players,
      maxPlayers,
      spectators,
      spectatorsAllowed,
      inGame: room.phase === 'briefing' || room.phase === 'playing',
      // User decision 10: the browser offers a seat only in the lobby, even where a code join
      // would still work (co-op mid-level, results).
      canJoinAsPlayer: room.phase === 'lobby' && players < maxPlayers,
      canSpectate: spectatorsAllowed && spectators < MAX_SPECTATORS,
      createdAt: room.createdAt,
    };
  }

  const roomList = createRoomListCache({
    now,
    ttlMs: ROOM_LIST_CACHE_MS,
    build: () =>
      [...rooms.values()].flatMap((room) => {
        const summary = summaryOf(room);
        return summary ? [summary] : [];
      }),
  });

  /**
   * Public rooms for the room browser: the cached list (at most `ROOM_LIST_CACHE_MS` old), then
   * the query's search, filters and limit. The caller gates it on the `roomBrowser` flag.
   */
  function listRooms(query: RoomListQuery): RoomListResponse {
    return queryRoomList(roomList.entries(), query);
  }

  return {
    handleMessage,
    handleDisconnect,
    tick,
    sendError,
    listRooms,
    /** How often the room list was rebuilt (the cache, S7-83). */
    get roomListBuilds() {
      return roomList.builds;
    },
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
        paused: room.paused,
        difficulty: room.difficulty,
        mode: room.mode,
        visibility: room.visibility,
        name: room.name,
        spectatorsAllowed: room.spectatorsAllowed,
        createdAt: room.createdAt,
        /** The dealt run with its seed (the seed never goes on the wire). */
        run: room.run ? { seed: room.run.seed, summary: { ...room.run.summary } } : null,
        /** Team 0's newsroom: the co-op game (an alias of `games[0]`). */
        game: room.teams[0].game,
        /** Every newsroom, by team. */
        games: room.teams.map((run) => run.game),
        forfeited: room.teams.map((run) => run.forfeited),
        outcome: room.outcome,
        stats: [...room.stats.values()],
        embargo: room.embargo,
        briefing: room.briefing
          ? { endsAt: room.briefing.endsAt, skippedBy: [...room.briefing.skippedBy] }
          : null,
        blunderVotes: [...room.blunderVotes].map(([playerId, vote]) => ({ playerId, ...vote })),
        players: playersOf(room).map((p) => ({
          id: p.id,
          nickname: p.nickname,
          colorIndex: p.colorIndex,
          connected: p.connection !== null,
          queued: p.inputQueue.length,
          role: p.role,
          ready: p.ready,
          team: p.team,
          clientId: p.clientId ?? null,
        })),
        spectators: spectatorsOf(room).map((s) => ({
          id: s.id,
          nickname: s.nickname,
          connected: s.connection !== null,
          team: s.team,
          clientId: s.clientId ?? null,
        })),
        /** Topics each connected member listens on, by member id. */
        topics: Object.fromEntries(
          [...room.members.values()].map((m) => [m.id, topicsFor(room.code, m)]),
        ),
      };
    },
  };
}
