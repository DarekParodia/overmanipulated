// Endless-mode leaderboard wire format (S4-11): `GET /api/leaderboard` returns it.
// Query: `scope=global` (default) or `scope=room&room=<CODE>`, optional `limit`.
import { z } from 'zod';
import { LEADERBOARD_DEFAULT_LIMIT } from './constants.ts';
import { nicknameSchema } from './protocol.ts';

export const leaderboardEntrySchema = z.object({
  roomCode: z.string().min(1).max(8),
  /** Nicknames of the crew that played the run. */
  players: z.array(nicknameSchema).min(1).max(4),
  score: z.number().int(),
  /** How long the newsroom survived, in whole seconds. */
  survivedS: z.number().int().nonnegative(),
  /** Unix ms when the run ended. */
  createdAt: z.number().int().nonnegative(),
});

export const leaderboardResponseSchema = z.object({
  scope: z.enum(['global', 'room']),
  entries: z.array(leaderboardEntrySchema).max(100),
});

export const leaderboardQuerySchema = z.object({
  scope: z.enum(['global', 'room']).default('global'),
  room: z.string().min(1).max(8).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(LEADERBOARD_DEFAULT_LIMIT),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
