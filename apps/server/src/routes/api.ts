// REST routes under /api. Chained so `AppType` carries full types for the client's hc client.
import { zValidator } from '@hono/zod-validator';
import {
  type LeaderboardResponse,
  leaderboardQuerySchema,
  levelIdSchema,
  normalizeHost,
  PROTOCOL_VERSION,
  type PublicConfig,
  type RoomListResponse,
  roomListQuerySchema,
} from '@redakcja/shared';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { clientAddress } from '../client-address.ts';
import { type ConfigMeta, DEFAULT_SERVER_CONFIG, type ServerConfig } from '../config.ts';
import { type Db, isDatabaseHealthy } from '../db/client.ts';
import { getBlunderTallies } from '../db/queries/blunder-votes.ts';
import { getTopEntries } from '../db/queries/leaderboard.ts';
import { ROOM_LIST_PER_MINUTE_PER_IP, ROOM_LIST_PRUNE_EVERY } from '../limits.ts';
import { toPublicConfig } from '../public-config.ts';
import { createRateLimiter } from '../rate-limit.ts';
import type { RoomRegistry } from '../rooms/registry.ts';

export type ApiDeps = {
  db: Db;
  registry: RoomRegistry;
  /** Running config.json (S7-68); absent in tests that build the app directly (defaults). */
  config?: () => ServerConfig;
  /** Where the running config came from and how often it was reloaded with changes. */
  configMeta?: () => ConfigMeta;
  /**
   * False when the served HTML cannot carry the ads CSP (a shell built without the nonce
   * placeholder), which forces ads off in the public config. `createApp` derives it from the
   * shell assets (`adsCspReady` in shell/assets.ts); absent here: true.
   */
  adsCspReady?: boolean;
  /** Monotonic ms for the per-address limiters; defaults to `performance.now` (tests inject one). */
  now?: () => number;
};

export const DEFAULT_CONFIG_META: ConfigMeta = { source: 'defaults', revision: 0 };

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
  const config = () => deps.config?.() ?? DEFAULT_SERVER_CONFIG;
  const roomListRequests = createRateLimiter({
    capacity: ROOM_LIST_PER_MINUTE_PER_IP,
    refillPerSecond: ROOM_LIST_PER_MINUTE_PER_IP / 60,
    ...(deps.now ? { now: deps.now } : {}),
  });
  let roomListRequestCount = 0;
  /**
   * The room browser's gate (S7-83): 404 while the `roomBrowser` flag is off (no address is even
   * counted then), 429 past the per-address budget. Runs before the query is validated.
   */
  const roomListGate = createMiddleware(async (c, next) => {
    if (!config().features.roomBrowser) {
      return c.json({ error: 'not found' }, 404);
    }
    roomListRequestCount += 1;
    if (roomListRequestCount % ROOM_LIST_PRUNE_EVERY === 0) {
      roomListRequests.prune();
    }
    if (!roomListRequests.take(clientAddress(c))) {
      return c.json({ error: 'too many requests' }, 429);
    }
    await next();
  });

  return (
    new Hono()
      .get('/health', (c) => {
        const body = healthStatus(deps);
        return c.json(body, body.status === 'ok' ? 200 : 503);
      })
      // Public subset of config.json for the requesting host; Caddy sends `no-store` on /api/*.
      .get('/config', (c) => {
        const meta = deps.configMeta?.() ?? DEFAULT_CONFIG_META;
        const body: PublicConfig = toPublicConfig(config(), {
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
      // Public rooms for the room browser (S7-83); the list itself is cached by the registry.
      .get('/rooms', roomListGate, zValidator('query', roomListQuerySchema), (c) => {
        const body: RoomListResponse = deps.registry.listRooms(c.req.valid('query'));
        c.header('Cache-Control', 'no-store');
        return c.json(body, 200);
      })
      .get('/stats/blunders', zValidator('query', blunderStatsQuerySchema), (c) => {
        const { levelId } = c.req.valid('query');
        return c.json({ levelId, stories: getBlunderTallies(deps.db, levelId) });
      })
  );
}
