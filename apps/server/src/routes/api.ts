// REST routes under /api. Chained so `AppType` carries full types for the client's hc client.
import { zValidator } from '@hono/zod-validator';
import {
  type LeaderboardResponse,
  leaderboardQuerySchema,
  levelIdSchema,
  normalizeHost,
  PROTOCOL_VERSION,
  type PublicConfig,
} from '@redakcja/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { type ConfigMeta, DEFAULT_SERVER_CONFIG, type ServerConfig } from '../config.ts';
import { type Db, isDatabaseHealthy } from '../db/client.ts';
import { getBlunderTallies } from '../db/queries/blunder-votes.ts';
import { getTopEntries } from '../db/queries/leaderboard.ts';
import { toPublicConfig } from '../public-config.ts';
import type { RoomRegistry } from '../rooms/registry.ts';

export type ApiDeps = {
  db: Db;
  registry: RoomRegistry;
  /** Running config.json (S7-68); absent in tests that build the app directly (defaults). */
  config?: () => ServerConfig;
  /** Where the running config came from and how often it was reloaded with changes. */
  configMeta?: () => ConfigMeta;
  /**
   * False when the served HTML cannot carry the ads CSP (S7-70: a shell built without the nonce
   * placeholder), which forces ads off in the public config. Absent (dev, tests): true.
   */
  adsCspReady?: boolean;
};

const DEFAULT_CONFIG_META: ConfigMeta = { source: 'defaults', revision: 0 };

/** Supervisor view of the debrief votes: which stories fooled the class most (S3-02). */
const blunderStatsQuerySchema = z.object({ levelId: levelIdSchema });

export function healthStatus(deps: ApiDeps) {
  const dbOk = isDatabaseHealthy(deps.db);
  return {
    status: dbOk ? ('ok' as const) : ('degraded' as const),
    db: dbOk ? ('ok' as const) : ('error' as const),
    rooms: deps.registry.roomCount,
    protocolVersion: PROTOCOL_VERSION,
    // Lets an operator confirm a reload took effect; neither value is sensitive.
    config: deps.configMeta?.() ?? DEFAULT_CONFIG_META,
  };
}

export function createApiRoutes(deps: ApiDeps) {
  return (
    new Hono()
      .get('/health', (c) => {
        const body = healthStatus(deps);
        return c.json(body, body.status === 'ok' ? 200 : 503);
      })
      // Public subset of config.json for the requesting host; Caddy sends `no-store` on /api/*.
      .get('/config', (c) => {
        const meta = deps.configMeta?.() ?? DEFAULT_CONFIG_META;
        const body: PublicConfig = toPublicConfig(deps.config?.() ?? DEFAULT_SERVER_CONFIG, {
          host: normalizeHost(c.req.header('host')),
          nowMs: Date.now(),
          revision: meta.revision,
          adsCspReady: deps.adsCspReady ?? true,
        });
        // MOTD windows and reloads change it at any time: never cache it, even without Caddy.
        c.header('Cache-Control', 'no-store');
        return c.json(body, 200);
      })
      .get('/leaderboard', zValidator('query', leaderboardQuerySchema), (c) => {
        const query = c.req.valid('query');
        if (query.scope === 'room' && query.room === undefined) {
          return c.json({ error: 'scope=room needs a room code' }, 400);
        }
        const entries = getTopEntries(deps.db, {
          limit: query.limit,
          difficulty: query.difficulty,
          roomCode: query.scope === 'room' ? query.room?.toUpperCase() : undefined,
        }).map((e) => ({
          roomCode: e.roomCode,
          players: e.players,
          score: e.score,
          difficulty: e.difficulty,
          survivedS: e.survivedS,
          createdAt: e.createdAt.getTime(),
        }));
        const body: LeaderboardResponse = { scope: query.scope, entries };
        return c.json(body, 200);
      })
      .get('/stats/blunders', zValidator('query', blunderStatsQuerySchema), (c) => {
        const { levelId } = c.req.valid('query');
        return c.json({ levelId, stories: getBlunderTallies(deps.db, levelId) });
      })
  );
}
