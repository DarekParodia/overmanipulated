// REST routes under /api. Chained so `AppType` carries full types for the client's hc client.
import { zValidator } from '@hono/zod-validator';
import {
  type LeaderboardResponse,
  leaderboardQuerySchema,
  levelIdSchema,
  PROTOCOL_VERSION,
} from '@redakcja/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { type Db, isDatabaseHealthy } from '../db/client.ts';
import { getBlunderTallies } from '../db/queries/blunder-votes.ts';
import { getTopEntries } from '../db/queries/leaderboard.ts';
import type { RoomRegistry } from '../rooms/registry.ts';

export type ApiDeps = { db: Db; registry: RoomRegistry };

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
      if (query.scope === 'room' && query.room === undefined) {
        return c.json({ error: 'scope=room needs a room code' }, 400);
      }
      const entries = getTopEntries(deps.db, {
        limit: query.limit,
        roomCode: query.scope === 'room' ? query.room?.toUpperCase() : undefined,
      }).map((e) => ({
        roomCode: e.roomCode,
        players: e.players,
        score: e.score,
        survivedS: e.survivedS,
        createdAt: e.createdAt.getTime(),
      }));
      const body: LeaderboardResponse = { scope: query.scope, entries };
      return c.json(body, 200);
    })
    .get('/stats/blunders', zValidator('query', blunderStatsQuerySchema), (c) => {
      const { levelId } = c.req.valid('query');
      return c.json({ levelId, stories: getBlunderTallies(deps.db, levelId) });
    });
}
