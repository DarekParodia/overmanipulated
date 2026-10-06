// Wire protocol between client and server. Every message is validated with these schemas on
// receipt; TypeScript types are inferred from them (AGENTS.md rule 5).
import { z } from 'zod';
import {
  MAX_PLAYERS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PLAYER_COLOR_COUNT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './constants.ts';
import { pingKindSchema, roleSchema, stationKindSchema, verdictSchema } from './domain.ts';
import {
  deskSchema,
  folderLocationSchema,
  folderOutcomeSchema,
  folderResultSchema,
  folderSchema,
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
  /** Verdict for the folder on the desk the sender has open. */
  z.object({
    kind: z.literal('verdict'),
    folderId: entityId,
    verdict: verdictSchema,
    justifyingStampId: entityId,
  }),
  /** Close the station minigame or desk sheet without a result. */
  z.object({ kind: z.literal('cancel') }),
  z.object({ kind: z.literal('ping'), ping: pingKindSchema }),
  /** Managing editor: extend one folder's deadline, once per level. */
  z.object({ kind: z.literal('extendDeadline'), folderId: entityId }),
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

export const roomPhaseSchema = z.enum(['lobby', 'playing', 'results']);

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
});

export const welcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  playerId: playerIdSchema,
  roomCode: roomCodeSchema,
  reconnectToken: reconnectTokenSchema,
});

export const roomStateMessageSchema = z.object({
  type: z.literal('roomState'),
  roomCode: roomCodeSchema,
  hostId: playerIdSchema,
  phase: roomPhaseSchema,
  levelId: levelIdSchema,
  players: z.array(lobbyPlayerSchema).max(MAX_PLAYERS),
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
  z.object({ kind: z.literal('folderExpired'), folderId: entityId, storyId: entityId }),
  z.object({ kind: z.literal('deadlineExtended'), folderId: entityId, playerId: playerIdSchema }),
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
  }),
  z.object({
    kind: z.literal('stampApplied'),
    stationId: entityId,
    playerId: playerIdSchema,
    folderId: entityId,
    stampId: entityId,
  }),
  z.object({
    kind: z.literal('deskOpened'),
    deskId: entityId,
    playerId: playerIdSchema,
    folderId: entityId,
  }),
  z.object({ kind: z.literal('deskClosed'), deskId: entityId, playerId: playerIdSchema }),
  z.object({
    kind: z.literal('verdictResult'),
    folderId: entityId,
    storyId: entityId,
    playerId: playerIdSchema,
    verdict: verdictSchema,
    justifyingStampId: entityId,
    outcome: folderOutcomeSchema,
    scoreDelta: z.number().int(),
    credibilityDelta: z.number().int(),
    speedBonus: z.boolean(),
    missedStampIds: z.array(entityId).max(16),
  }),
  z.object({ kind: z.literal('ping'), playerId: playerIdSchema, ping: pingKindSchema }),
]);

export const eventMessageSchema = z.object({
  type: z.literal('event'),
  tick: z.number().int().nonnegative(),
  event: gameEventSchema,
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
  won: z.boolean(),
  stars: z.number().int().min(0).max(3),
  score: z.number().int(),
  credibility: z.number().int(),
  results: z.array(folderResultSchema).max(128),
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
]);

// --- Types ---------------------------------------------------------------------------------

export type RoomCode = z.infer<typeof roomCodeSchema>;
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
export type LobbyPlayer = z.infer<typeof lobbyPlayerSchema>;
export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;
export type RoomStateMessage = z.infer<typeof roomStateMessageSchema>;
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;
export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type EventMessage = z.infer<typeof eventMessageSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
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
