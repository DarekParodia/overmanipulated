// Endless-mode leaderboard wire format (S4-11): `GET /api/leaderboard` returns it.
// Query: `scope=global` (default) or `scope=room&room=<CODE>`, optional `limit`, and the
// `difficulty` the runs were played on (default `normal`, S7-26): every difficulty has its own list.
import { z } from 'zod';
import { DEFAULT_DIFFICULTY, LEADERBOARD_DEFAULT_LIMIT } from './constants.ts';
import { difficultySchema } from './domain.ts';
import { nicknameSchema } from './protocol.ts';

export const leaderboardEntrySchema = z.object({
  roomCode: z.string().min(1).max(8),
  /** Nicknames of the crew that played the run. */
  players: z.array(nicknameSchema).min(1).max(4),
  score: z.number().int(),
  /** The difficulty the run was played on (S7-26). */
  difficulty: difficultySchema,
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
  difficulty: difficultySchema.default(DEFAULT_DIFFICULTY),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
