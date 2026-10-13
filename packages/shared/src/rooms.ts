// Room browser wire format (S7-78): `GET /api/rooms` returns it when the `roomBrowser` flag is
// on (S7-83). Only public rooms with connected members are listed; the host nickname is passed
// through the name filter's `maskName`.
import { z } from 'zod';
import {
  MAX_ROOM_PLAYERS,
  MAX_SPECTATORS,
  ROOM_LIST_MAX,
  ROOM_SEARCH_MAX_LENGTH,
} from './constants.ts';
import { difficultySchema } from './domain.ts';
import {
  levelIdSchema,
  nicknameSchema,
  roomCodeSchema,
  roomModeSchema,
  roomNameSchema,
} from './protocol.ts';

/** `open`: lobby or results (not in a match); `inGame`: briefing or playing. */
export const roomListStatusSchema = z.enum(['any', 'open', 'inGame']);

export const roomSummarySchema = z.object({
  code: roomCodeSchema,
  name: roomNameSchema.nullable(),
  /** Already masked by the name filter. */
  hostNickname: nicknameSchema,
  levelId: levelIdSchema,
  mode: roomModeSchema,
  difficulty: difficultySchema,
  /** Players of every team (connected or within the reconnect grace). */
  players: z.number().int().min(0).max(MAX_ROOM_PLAYERS),
  /** Player seats for the mode: 4 in co-op, 8 in versus. */
  maxPlayers: z.number().int().min(1).max(MAX_ROOM_PLAYERS),
  spectators: z.number().int().min(0).max(MAX_SPECTATORS),
  /** Widownia is open. */
  spectatorsAllowed: z.boolean(),
  /** The room is in the briefing or playing a level. */
  inGame: z.boolean(),
  /** A player may join now: lobby phase with a free seat. */
  canJoinAsPlayer: z.boolean(),
  /** A spectator may join now: Widownia open with a free seat. */
  canSpectate: z.boolean(),
  /** Unix ms when the room was created. */
  createdAt: z.number().int().nonnegative(),
});

export const roomListQuerySchema = z.object({
  /** Matched with `foldSearch` against the code, the room name and the host nickname. */
  q: z.string().trim().max(ROOM_SEARCH_MAX_LENGTH).optional(),
  mode: roomModeSchema.optional(),
  levelId: levelIdSchema.optional(),
  difficulty: difficultySchema.optional(),
  status: roomListStatusSchema.default('any'),
  limit: z.coerce.number().int().min(1).max(ROOM_LIST_MAX).default(ROOM_LIST_MAX),
});

export const roomListResponseSchema = z.object({
  rooms: z.array(roomSummarySchema).max(ROOM_LIST_MAX),
  /** Matching rooms before the limit. */
  total: z.number().int().nonnegative(),
});

export type RoomListStatus = z.infer<typeof roomListStatusSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type RoomListQuery = z.infer<typeof roomListQuerySchema>;
export type RoomListResponse = z.infer<typeof roomListResponseSchema>;

/**
 * Search form of a text: lower case, Polish (and any other) diacritics stripped, `ł` → `l`,
 * whitespace runs collapsed to one space and trimmed. `foldSearch('Łukasz Żółć') === 'lukasz zolc'`.
 */
export function foldSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
