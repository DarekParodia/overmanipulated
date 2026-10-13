// Wire protocol between client and server. Every message is validated with these schemas on
// receipt; TypeScript types are inferred from them (AGENTS.md rule 5).
import { z } from 'zod';
import {
  CLIENT_ID_LENGTH,
  ENDLESS,
  MAX_PLAYERS,
  MAX_REQUIRED_STAMPS,
  MAX_ROOM_PLAYERS,
  MAX_SPECTATORS,
  MAX_TEAM_PLAYERS,
  MAX_TEAMS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PLAYER_COLOR_COUNT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
} from './constants.ts';
import {
  abilitySchema,
  abilityStageSchema,
  difficultySchema,
  levelEventKindSchema,
  pingKindSchema,
  roleSchema,
  stampSourceSchema,
  stationKindSchema,
  verdictSchema,
} from './domain.ts';
import {
  abilityStateSchema,
  deskSchema,
  folderLocationSchema,
  folderResultSchema,
  folderSchema,
  lossReasonSchema,
  nextFolderSchema,
  spawnKeySchema,
  stationSchema,
} from './entities.ts';

// --- Primitives ----------------------------------------------------------------------------

export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`));

/** Trimmed, no control characters. Polish letters and spaces are allowed. */
export const nicknameSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN_LENGTH)
  .max(NICKNAME_MAX_LENGTH)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);

export const playerIdSchema = z.string().min(1).max(32);
const entityId = z.string().min(1).max(64);
export const levelIdSchema = z.string().min(1).max(64);
export const reconnectTokenSchema = z.string().min(16).max(64);

/**
 * Opaque random id a browser keeps in localStorage and sends on join (S7-77), so a kick cooldown
 * can follow a browser rather than an IP a whole class shares.
 */
export const clientIdSchema = z
  .string()
  .min(CLIENT_ID_LENGTH.min)
  .max(CLIENT_ID_LENGTH.max)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Razem (one shared newsroom) or Na punkty (two newsrooms race on the same run). */
export const roomModeSchema = z.enum(['coop', 'versus']);
/** Private rooms are reached by code only; public ones show in the room browser. */
export const roomVisibilitySchema = z.enum(['private', 'public']);
/** A room member plays, or watches from the Widownia. */
export const memberKindSchema = z.enum(['player', 'spectator']);
/** 0 = Kurier, 1 = Głos. A co-op room has team 0 only. */
export const teamIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_TEAMS - 1);
/**
 * A room's display name: trimmed, no control characters. The shared name filter (S7-78) is
 * applied by the server, which answers `invalidName`, not by this schema.
 */
export const roomNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ROOM_NAME_MAX_LENGTH)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);
/** How a versus match was decided. */
export const versusEndReasonSchema = z.enum(['score', 'credibility', 'forfeit', 'draw']);

const unitAxis = z.number().min(-1).max(1);
const finite = z.number().finite();

export const moveVectorSchema = z.object({ x: unitAxis, y: unitAxis });

export const inputActionsSchema = z.object({
  /** Edge-triggered: true on the tick the pick-up/put-down button was pressed. */
  interact: z.boolean(),
  /** Held: true while the work button is held. */
  work: z.boolean(),
});

// --- Client → server -----------------------------------------------------------------------

export const joinMessageSchema = z.object({
  type: z.literal('join'),
  protocolVersion: z.number().int(),
  nickname: nicknameSchema,
  /** Omitted to create a new room. */
  roomCode: roomCodeSchema.optional(),
  /** Present when resuming a slot after a disconnect. */
  reconnectToken: reconnectTokenSchema.optional(),
  /** Join as a player (the default when omitted) or as a spectator (S7-77). */
  as: memberKindSchema.optional(),
  /** The browser's stable client id (kick cooldown); old clients omit it. */
  clientId: clientIdSchema.optional(),
});

export const lobbyActionSchema = z.discriminatedUnion('kind', [
  /** Host only: start the selected level. */
  z.object({ kind: z.literal('start') }),
  /** Roles are optional and non-exclusive; null clears the choice. */
  z.object({ kind: z.literal('setRole'), role: roleSchema.nullable() }),
  z.object({ kind: z.literal('setReady'), ready: z.boolean() }),
  /** Host only. */
  z.object({ kind: z.literal('selectLevel'), levelId: levelIdSchema }),
  /** From the results screen back to the lobby (host only). */
  z.object({ kind: z.literal('backToLobby') }),
  /** During the briefing: this player is ready to play (all connected skip → level starts). */
  z.object({ kind: z.literal('skipBriefing') }),
  /** On the results/debrief screen: vote for the story that fooled the team most. */
  z.object({ kind: z.literal('voteBlunder'), storyId: entityId }),
  /** Host only, lobby only; resets every player's ready flag like `selectLevel` (S7-23). */
  z.object({ kind: z.literal('setDifficulty'), difficulty: difficultySchema }),
  /**
   * In-game menu (S7-10): pause or resume. Pausing is accepted only while playing a co-op room
   * with exactly one connected player and no spectators; anyone joining clears it.
   */
  z.object({ kind: z.literal('setPaused'), paused: z.boolean() }),
  /** Host only, lobby only: Razem or Na punkty (S7-80). */
  z.object({ kind: z.literal('setMode'), mode: roomModeSchema }),
  /** Versus, lobby or results: move yourself, or (host) another player, to a team (S7-80). */
  z.object({
    kind: z.literal('setTeam'),
    team: teamIndexSchema,
    playerId: playerIdSchema.optional(),
  }),
  /** Lobby or results: move yourself, or (host) another member, to or from the Widownia (S7-81). */
  z.object({
    kind: z.literal('setSpectator'),
    spectator: z.boolean(),
    playerId: playerIdSchema.optional(),
  }),
  /** Host only, any phase: list the room in the room browser or not (S7-82). */
  z.object({ kind: z.literal('setVisibility'), visibility: roomVisibilitySchema }),
  /** Host only, any phase: name the room; null clears the name (S7-82). */
  z.object({ kind: z.literal('setRoomName'), name: roomNameSchema.nullable() }),
  /** Host only: let spectators join (Widownia), off by default (S7-81). */
  z.object({ kind: z.literal('setSpectatorsAllowed'), allowed: z.boolean() }),
  /** Host only, never yourself: remove a member from the room (S7-82). */
  z.object({ kind: z.literal('kick'), playerId: playerIdSchema }),
  /** Host only: hand the host role to another connected member (S7-82). */
  z.object({ kind: z.literal('transferHost'), playerId: playerIdSchema }),
]);

export const lobbyMessageSchema = z.object({
  type: z.literal('lobby'),
  action: lobbyActionSchema,
});

export const inputMessageSchema = z.object({
  type: z.literal('input'),
  /** Monotonic per connection; echoed back as `lastInputSeq` in snapshots. */
  seq: z.number().int().nonnegative(),
  move: moveVectorSchema,
  actions: inputActionsSchema,
});

/**
 * Player decisions that are not per-tick input. The server queues them and applies them in the
 * next simulation step (extension of the design-doc protocol; see the plan's Decision log).
 */
export const playerCommandSchema = z.discriminatedUnion('kind', [
  /** Outcome of the station minigame the sender is operating. */
  z.object({ kind: z.literal('minigameResult'), stationId: entityId, success: z.boolean() }),
  /** Verdict for the folder on the desk the sender has open, citing the stamps that prove it. */
  z.object({
    kind: z.literal('verdict'),
    folderId: entityId,
    verdict: verdictSchema,
    justifyingStampIds: z.array(entityId).min(1).max(MAX_REQUIRED_STAMPS),
  }),
  /** Close the station minigame or desk sheet without a result. */
  z.object({ kind: z.literal('cancel') }),
  z.object({ kind: z.literal('ping'), ping: pingKindSchema }),
  /**
   * Press of the role ability (R / RB / the fourth touch button). It carries no target: the
   * server resolves it with the shared ability preview, which the HUD shows too (S7-36).
   */
  z.object({ kind: z.literal('useAbility') }),
]);

export const commandMessageSchema = z.object({
  type: z.literal('command'),
  command: playerCommandSchema,
});

export const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  /** Client clock value, echoed back for round-trip measurement. */
  clientTime: finite,
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinMessageSchema,
  lobbyMessageSchema,
  inputMessageSchema,
  commandMessageSchema,
  heartbeatMessageSchema,
]);

// --- Server → client -----------------------------------------------------------------------

/** lobby → briefing (topic of the day, skippable) → playing → results (debrief) → lobby. */
export const roomPhaseSchema = z.enum(['lobby', 'briefing', 'playing', 'results']);

export const briefingStateSchema = z.object({
  /** Time left before the level starts by itself. */
  endsInMs: finite,
  /** Players who pressed "ready" on the briefing. */
  skippedBy: z.array(playerIdSchema).max(MAX_ROOM_PLAYERS),
});

export const blunderVoteSchema = z.object({ playerId: playerIdSchema, storyId: entityId });

export const lobbyPlayerSchema = z.object({
  id: playerIdSchema,
  nickname: nicknameSchema,
  colorIndex: z
    .number()
    .int()
    .min(0)
    .max(PLAYER_COLOR_COUNT - 1),
  connected: z.boolean(),
  role: roleSchema.nullable(),
  ready: z.boolean(),
  /** The player's newsroom; always 0 in co-op (S7-77). */
  team: teamIndexSchema,
});

/** A member watching from the Widownia (S7-77). */
export const lobbySpectatorSchema = z.object({
  id: playerIdSchema,
  nickname: nicknameSchema,
  connected: z.boolean(),
});

export const welcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  playerId: playerIdSchema,
  roomCode: roomCodeSchema,
  reconnectToken: reconnectTokenSchema,
});

export const starThresholdsSchema = z.object({
  two: z.number().int().nonnegative(),
  three: z.number().int().nonnegative(),
});

/**
 * What a prepared run holds (`runSummary`, S7-21): dealt folders, the score a perfect team can
 * reach, and the star thresholds (null in endless). `roomState.run` carries it from the briefing
 * on (S7-23); the run seed that dealt it stays on the server, so it never spoils the sequence.
 */
export const runSummarySchema = z.object({
  folders: z.number().int().nonnegative(),
  maxScore: z.number().int().nonnegative(),
  stars: starThresholdsSchema.nullable(),
});

export const roomStateMessageSchema = z.object({
  type: z.literal('roomState'),
  roomCode: roomCodeSchema,
  hostId: playerIdSchema,
  phase: roomPhaseSchema,
  levelId: levelIdSchema,
  /** Players of every team, in join order (up to 4 per team). */
  players: z.array(lobbyPlayerSchema).max(MAX_ROOM_PLAYERS),
  /** Set while `phase === 'briefing'`. */
  briefing: briefingStateSchema.nullable(),
  /** Blunder-of-the-day votes cast on the results screen (one per player). */
  blunderVotes: z.array(blunderVoteSchema).max(MAX_ROOM_PLAYERS),
  /** The room's difficulty (host picks it in the lobby; it persists across level changes). */
  difficulty: difficultySchema,
  /** The run dealt at the briefing, kept through play and results; null in the lobby. */
  run: runSummarySchema.nullable(),
  /** Razem or Na punkty (S7-77); a new room is co-op. */
  mode: roomModeSchema,
  /** A new room is private. */
  visibility: roomVisibilitySchema,
  /** The host's name for the room, or null. */
  name: roomNameSchema.nullable(),
  /** Widownia: whether spectators may join; off by default. */
  spectatorsAllowed: z.boolean(),
  spectators: z.array(lobbySpectatorSchema).max(MAX_SPECTATORS),
});

/** One newsroom's standing, for the rival chip, the spectator scoreboard and versus results. */
export const teamScoreSchema = z.object({
  team: teamIndexSchema,
  score: z.number().int(),
  credibility: z.number().int(),
  /** Folders closed with a verdict. */
  resolved: z.number().int().nonnegative(),
  /** Folders that ran out of time. */
  expired: z.number().int().nonnegative(),
  /** Connected players of the team. */
  connected: z.number().int().min(0).max(MAX_TEAM_PLAYERS),
});

export const playerSnapshotSchema = z.object({
  id: playerIdSchema,
  x: finite,
  y: finite,
  /** Radians, 0 = facing +x, counter-clockwise towards +y. */
  facing: finite,
  moving: z.boolean(),
  lastInputSeq: z.number().int().min(-1),
});

/** One player's ability state in a snapshot; roles stay in `roomState.players` (S7-36). */
export const crewSnapshotSchema = abilityStateSchema.extend({ id: playerIdSchema });

export const snapshotMessageSchema = z.object({
  type: z.literal('snapshot'),
  tick: z.number().int().nonnegative(),
  players: z.array(playerSnapshotSchema).max(MAX_PLAYERS),
  /** Level time since start. */
  elapsedMs: finite,
  timeLeftMs: finite,
  score: z.number().int(),
  credibility: z.number().int(),
  folders: z.array(folderSchema).max(64),
  stations: z.array(stationSchema).max(32),
  desks: z.array(deskSchema).max(8),
  /** The next scheduled folder; null once the schedule is used up. Event folders never show. */
  nextFolder: nextFolderSchema.nullable(),
  /** A scheduled folder is due but waits, because every conveyor tile holds a folder. */
  conveyorFull: z.boolean(),
  /** Every player's ability state, in join order (S7-36). */
  crew: z.array(crewSnapshotSchema).max(MAX_PLAYERS),
  /** A solo player has the in-game menu open: the room is not stepped (S7-10). */
  paused: z.boolean(),
  /** Which newsroom this snapshot shows (S7-77). */
  team: teamIndexSchema.optional(),
  /** Versus only: both teams' standings. */
  scoreboard: z.array(teamScoreSchema).max(MAX_TEAMS).optional(),
});

export const gameEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('playerJoined'), playerId: playerIdSchema }),
  z.object({ kind: z.literal('playerLeft'), playerId: playerIdSchema }),
  z.object({ kind: z.literal('playerReconnected'), playerId: playerIdSchema }),
  z.object({ kind: z.literal('gameStarted') }),
  z.object({
    kind: z.literal('folderSpawned'),
    folderId: entityId,
    storyId: entityId,
    fixtureId: entityId,
  }),
  z.object({ kind: z.literal('folderPickedUp'), folderId: entityId, playerId: playerIdSchema }),
  z.object({
    kind: z.literal('folderPutDown'),
    folderId: entityId,
    playerId: playerIdSchema,
    location: folderLocationSchema,
  }),
  z.object({ kind: z.literal('deadlineWarning'), folderId: entityId }),
  z.object({
    kind: z.literal('folderExpired'),
    folderId: entityId,
    /** The expired folder's spawn key, so its result carries it (S7-13). */
    spawnKey: spawnKeySchema,
    storyId: entityId,
    /** Stamps the folder had collected when it expired. */
    stamps: z.array(entityId).max(16),
  }),
  z.object({ kind: z.literal('workStarted'), stationId: entityId, playerId: playerIdSchema }),
  z.object({ kind: z.literal('workCancelled'), stationId: entityId, playerId: playerIdSchema }),
  z.object({
    kind: z.literal('minigameStarted'),
    stationId: entityId,
    station: stationKindSchema,
    playerId: playerIdSchema,
    folderId: entityId,
    seed: z.number().int(),
  }),
  z.object({
    kind: z.literal('minigameFailed'),
    stationId: entityId,
    playerId: playerIdSchema,
    folderId: entityId,
    /** How long the station is now locked: the difficulty-scaled lockout (protocol 4). */
    lockoutMs: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('stampApplied'),
    stationId: entityId,
    playerId: playerIdSchema,
    folderId: entityId,
    stampId: entityId,
    /** What earned the stamp: the minigame, Ekspertyza or Telefon z terenu (S7-36). */
    via: stampSourceSchema,
  }),
  z.object({
    kind: z.literal('deskOpened'),
    deskId: entityId,
    playerId: playerIdSchema,
    folderId: entityId,
  }),
  z.object({ kind: z.literal('deskClosed'), deskId: entityId, playerId: playerIdSchema }),
  /** The folder's result as it goes into the level summary, plus who gave the verdict. */
  folderResultSchema.extend({
    kind: z.literal('verdictResult'),
    playerId: playerIdSchema,
    verdict: verdictSchema,
  }),
  z.object({ kind: z.literal('ping'), playerId: playerIdSchema, ping: pingKindSchema }),
  /** A level event starts or ends (S4-05). `folderIds` are the folders it concerns. */
  z.object({
    kind: z.literal('levelEvent'),
    event: levelEventKindSchema,
    phase: z.enum(['start', 'end']),
    folderIds: z.array(entityId).max(8),
    stationId: entityId.optional(),
    durationMs: finite.optional(),
  }),
  /**
   * A role ability changed stage (S7-36). `folderId`, `stationId` and `targetPlayerId` name what
   * it acted on, `addedMs` the time Przedłużenie added; `reason` is set only when a Telefon z
   * terenu call is cancelled.
   */
  z.object({
    kind: z.literal('ability'),
    playerId: playerIdSchema,
    ability: abilitySchema,
    stage: abilityStageSchema,
    folderId: entityId.optional(),
    stationId: entityId.optional(),
    targetPlayerId: playerIdSchema.optional(),
    addedMs: finite.optional(),
    reason: z.enum(['dropped', 'gone']).optional(),
  }),
  /**
   * Koło ratunkowe saved a folder that reached its deadline in a Ratownik's hands (S7-36).
   * `folderIds` lists every folder that got the time (a botRaid wave moves together).
   */
  z.object({
    kind: z.literal('folderRescued'),
    playerId: playerIdSchema,
    folderId: entityId,
    addedMs: finite,
    folderIds: z.array(entityId).min(1).max(8),
  }),
  /** A verdict on one botRaid folder resolved the whole wave. */
  z.object({
    kind: z.literal('raidResolved'),
    raidId: entityId,
    byFolderId: entityId,
    folderIds: z.array(entityId).max(8),
  }),
]);

export const eventMessageSchema = z.object({
  type: z.literal('event'),
  tick: z.number().int().nonnegative(),
  event: gameEventSchema,
  /** Which newsroom the event happened in (S7-77). */
  team: teamIndexSchema.optional(),
});

/**
 * The spectator view of a closed folder in versus while the rival newsroom still has the same
 * spawn key in play (S7-77): who closed it and how, never the verdict, outcome, reason or points.
 * Strict, so a result field can never ride along.
 */
export const verdictMaskedEventSchema = z.strictObject({
  kind: z.literal('verdictMasked'),
  /** Who gave the verdict; null when the folder expired. */
  playerId: playerIdSchema.nullable(),
  folderId: entityId,
  spawnKey: spawnKeySchema,
  closedBy: z.enum(['verdict', 'expired']),
});

/** A held result, released once both newsrooms closed its spawn key or the level ended. */
export const verdictRevealedEventSchema = z.object({
  kind: z.literal('verdictRevealed'),
  result: folderResultSchema.extend({
    /** Who gave the verdict; null when the folder expired. */
    playerId: playerIdSchema.nullable(),
  }),
});

/** What the spectator topic carries as events: game events, plus the embargo's two kinds. */
export const spectatorEventSchema = z.discriminatedUnion('kind', [
  ...gameEventSchema.options,
  verdictMaskedEventSchema,
  verdictRevealedEventSchema,
]);

/** Spectators only (players never receive it): one team's event after the versus embargo. */
export const spectatorEventMessageSchema = z.object({
  type: z.literal('spectatorEvent'),
  tick: z.number().int().nonnegative(),
  team: teamIndexSchema,
  event: spectatorEventSchema,
});

/** One player's live match counters (S7-77), kept by the server's stats accumulator. */
export const playerStatsSchema = z.object({
  playerId: playerIdSchema,
  team: teamIndexSchema,
  /** Verdicts given. */
  verdicts: z.number().int().nonnegative(),
  /** Verdicts with outcome `correct`. */
  correct: z.number().int().nonnegative(),
  /** Verdicts with outcome `wrong`. */
  wrong: z.number().int().nonnegative(),
  stamps: z.number().int().nonnegative(),
  minigameFails: z.number().int().nonnegative(),
  /** Abilities used to the end (stage `done`). */
  abilities: z.number().int().nonnegative(),
});

/** Spectators only, at 1 Hz: every player's counters and every team's standing. */
export const matchStatsMessageSchema = z.object({
  type: z.literal('matchStats'),
  tick: z.number().int().nonnegative(),
  players: z.array(playerStatsSchema).max(MAX_ROOM_PLAYERS),
  teams: z.array(teamScoreSchema).min(1).max(MAX_TEAMS),
});

/** How a versus match ended, sent with each team's `levelEnd`. */
export const versusSummarySchema = z.object({
  /** null on a draw. */
  winnerTeam: teamIndexSchema.nullable(),
  reason: versusEndReasonSchema,
  teams: z.array(teamScoreSchema).length(MAX_TEAMS),
  /** The rival newsroom's results; each carries the spawn key that pairs it with one of ours. */
  rivalResults: z.array(folderResultSchema).max(ENDLESS.maxResultsSent),
});

export const errorCodeSchema = z.enum([
  'invalidMessage',
  'protocolMismatch',
  'invalidNickname',
  'roomNotFound',
  'roomFull',
  'reconnectFailed',
  'notHost',
  'notInRoom',
  'notReady',
  'unknownLevel',
  // Stage 7, M6 (S7-77)
  'teamFull',
  'spectatorsFull',
  'spectatorsOff',
  'matchInProgress',
  'teamEmpty',
  'kicked',
  'kickCooldown',
  'invalidTarget',
  'invalidName',
  'featureDisabled',
]);

export const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: errorCodeSchema,
  /** English diagnostic for logs; players see a Polish string chosen by `code`. */
  detail: z.string().max(200).optional(),
});

/** Sent once when the level ends; the room moves to the `results` phase. */
export const levelEndMessageSchema = z.object({
  type: z.literal('levelEnd'),
  levelId: levelIdSchema,
  /** The difficulty the run was played on (progress and the leaderboard are kept per difficulty). */
  difficulty: difficultySchema,
  won: z.boolean(),
  stars: z.number().int().min(0).max(3),
  score: z.number().int(),
  credibility: z.number().int(),
  results: z.array(folderResultSchema).max(ENDLESS.maxResultsSent),
  /** Why the level was lost; null when it was won. An endless run always ends on credibility. */
  lossReason: lossReasonSchema.nullable(),
  /** The run's two- and three-star scores; null in endless (no stars). */
  starThresholds: starThresholdsSchema.nullable(),
  /** The best score a perfect team could reach in this run; null in endless. */
  maxScore: z.number().int().nonnegative().nullable(),
  /** Endless runs only: whole seconds the newsroom survived (also stored on the leaderboard). */
  survivedS: z.number().int().nonnegative().optional(),
  /** The newsroom this result belongs to (S7-77). */
  team: teamIndexSchema.optional(),
  /** Every player's match counters. */
  stats: z.array(playerStatsSchema).max(MAX_ROOM_PLAYERS).optional(),
  /** Versus only; `won` then means this team won the match. */
  versus: versusSummarySchema.optional(),
});

export const heartbeatAckMessageSchema = z.object({
  type: z.literal('heartbeatAck'),
  clientTime: finite,
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeMessageSchema,
  roomStateMessageSchema,
  snapshotMessageSchema,
  eventMessageSchema,
  errorMessageSchema,
  levelEndMessageSchema,
  heartbeatAckMessageSchema,
  spectatorEventMessageSchema,
  matchStatsMessageSchema,
]);

// --- Types ---------------------------------------------------------------------------------

export type RoomCode = z.infer<typeof roomCodeSchema>;
export type ClientId = z.infer<typeof clientIdSchema>;
export type RoomMode = z.infer<typeof roomModeSchema>;
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type MemberKind = z.infer<typeof memberKindSchema>;
export type TeamIndex = z.infer<typeof teamIndexSchema>;
export type VersusEndReason = z.infer<typeof versusEndReasonSchema>;
export type LobbySpectator = z.infer<typeof lobbySpectatorSchema>;
export type TeamScore = z.infer<typeof teamScoreSchema>;
export type SpectatorEvent = z.infer<typeof spectatorEventSchema>;
export type SpectatorEventMessage = z.infer<typeof spectatorEventMessageSchema>;
export type PlayerStats = z.infer<typeof playerStatsSchema>;
export type MatchStatsMessage = z.infer<typeof matchStatsMessageSchema>;
export type VersusSummary = z.infer<typeof versusSummarySchema>;
export type MoveVector = z.infer<typeof moveVectorSchema>;
export type InputActions = z.infer<typeof inputActionsSchema>;
export type JoinMessage = z.infer<typeof joinMessageSchema>;
export type LobbyAction = z.infer<typeof lobbyActionSchema>;
export type LobbyMessage = z.infer<typeof lobbyMessageSchema>;
export type PlayerCommand = z.infer<typeof playerCommandSchema>;
export type CommandMessage = z.infer<typeof commandMessageSchema>;
export type InputMessage = z.infer<typeof inputMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type RoomPhase = z.infer<typeof roomPhaseSchema>;
export type BriefingState = z.infer<typeof briefingStateSchema>;
export type BlunderVote = z.infer<typeof blunderVoteSchema>;
export type LobbyPlayer = z.infer<typeof lobbyPlayerSchema>;
export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;
export type RoomStateMessage = z.infer<typeof roomStateMessageSchema>;
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;
export type CrewSnapshot = z.infer<typeof crewSnapshotSchema>;
export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type EventMessage = z.infer<typeof eventMessageSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type StarThresholds = z.infer<typeof starThresholdsSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type LevelEndMessage = z.infer<typeof levelEndMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

// --- Parsing helpers -----------------------------------------------------------------------

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: string | unknown): ParseResult<T> {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'malformed JSON' };
    }
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) };
  }
  return { ok: true, message: result.data };
}

/** Parses a raw WebSocket payload (string) or an already decoded value from a client. */
export function parseClientMessage(raw: string | unknown): ParseResult<ClientMessage> {
  return parseWith(clientMessageSchema, raw);
}

/** Parses a raw WebSocket payload (string) or an already decoded value from the server. */
export function parseServerMessage(raw: string | unknown): ParseResult<ServerMessage> {
  return parseWith(serverMessageSchema, raw);
}

/** Serialises a message for the wire. Kept as one function so a binary format can replace it. */
export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
