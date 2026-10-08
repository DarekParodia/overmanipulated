// REST routes under /api. Chained so `AppType` carries full types for the client's hc client.
import { zValidator } from '@hono/zod-validator';
import { LEADERBOARD_DEFAULT_LIMIT, levelIdSchema, PROTOCOL_VERSION } from '@redakcja/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { type Db, isDatabaseHealthy } from '../db/client.ts';
import { getBlunderTallies } from '../db/queries/blunder-votes.ts';
import { getTopEntries } from '../db/queries/leaderboard.ts';
import { gameModes } from '../db/schema.ts';
import type { RoomRegistry } from '../rooms/registry.ts';

export type ApiDeps = { db: Db; registry: RoomRegistry };

const leaderboardQuerySchema = z.object({
  mode: z.enum(gameModes),
  levelId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(LEADERBOARD_DEFAULT_LIMIT),
});

/** Supervisor view of the debrief votes: which stories fooled the class most (S3-02). */
const blunderStatsQuerySchema = z.object({ levelId: levelIdSchema });

export function healthStatus(deps: ApiDeps) {
  const dbOk = isDatabaseHealthy(deps.db);
  return {
    status: dbOk ? ('ok' as const) : ('degraded' as const),
    db: dbOk ? ('ok' as const) : ('error' as const),
    rooms: deps.registry.roomCount,
    protocolVersion: PROTOCOL_VERSION,
  };
}

export function createApiRoutes(deps: ApiDeps) {
  return new Hono()
    .get('/health', (c) => {
      const body = healthStatus(deps);
      return c.json(body, body.status === 'ok' ? 200 : 503);
    })
    .get('/leaderboard', zValidator('query', leaderboardQuerySchema), (c) => {
      const query = c.req.valid('query');
      const entries = getTopEntries(deps.db, query).map((e) => ({
        nicknames: e.nicknames,
        score: e.score,
        levelId: e.levelId,
        createdAt: e.createdAt.toISOString(),
      }));
      return c.json({ entries });
    })
    .get('/stats/blunders', zValidator('query', blunderStatsQuerySchema), (c) => {
      const { levelId } = c.req.valid('query');
      return c.json({ levelId, stories: getBlunderTallies(deps.db, levelId) });
    });
}
