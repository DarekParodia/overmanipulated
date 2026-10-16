// REST routes under /api. Chained so `AppType` carries full types for the client's hc client.
import { zValidator } from '@hono/zod-validator';
import {
  clientErrorReportSchema,
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
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { clientAddress } from '../client-address.ts';
import { type ConfigMeta, DEFAULT_SERVER_CONFIG, type ServerConfig } from '../config.ts';
import { type Db, isDatabaseHealthy } from '../db/client.ts';
import { getBlunderTallies } from '../db/queries/blunder-votes.ts';
import { getTopEntries } from '../db/queries/leaderboard.ts';
import {
  CLIENT_ERROR_BODY_MAX_BYTES,
  CLIENT_ERROR_LOG_MESSAGE_CHARS,
  CLIENT_ERROR_LOG_STACK_CHARS,
  CLIENT_ERROR_PRUNE_EVERY,
  CLIENT_ERROR_REPORTS_PER_MINUTE_PER_IP,
  ROOM_LIST_PER_MINUTE_PER_IP,
  ROOM_LIST_PRUNE_EVERY,
} from '../limits.ts';
import { log } from '../log.ts';
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

/**
 * A per-address request budget as a middleware: a token bucket (`createRateLimiter`) refilled
 * evenly over a minute, 429 past its burst. Every `pruneEvery` requests the idle addresses are
 * forgotten (no timer), so the map stays small.
 */
function addressBudget(options: {
  perMinute: number;
  pruneEvery: number;
  now?: (() => number) | undefined;
}) {
  const limiter = createRateLimiter({
    capacity: options.perMinute,
    refillPerSecond: options.perMinute / 60,
    ...(options.now ? { now: options.now } : {}),
  });
  let requests = 0;
  return createMiddleware(async (c, next) => {
    requests += 1;
    if (requests % options.pruneEvery === 0) {
      limiter.prune();
    }
    if (!limiter.take(clientAddress(c))) {
      return c.json({ error: 'too many requests' }, 429);
    }
    await next();
  });
}

export function createApiRoutes(deps: ApiDeps) {
  const config = () => deps.config?.() ?? DEFAULT_SERVER_CONFIG;
  const roomListBudget = addressBudget({
    perMinute: ROOM_LIST_PER_MINUTE_PER_IP,
    pruneEvery: ROOM_LIST_PRUNE_EVERY,
    now: deps.now,
  });
  /**
   * The room browser's gate (S7-83): 404 while the `roomBrowser` flag is off (no address is even
   * counted then), 429 past the per-address budget. Runs before the query is validated.
   */
  const roomListGate = createMiddleware(async (c, next) => {
    if (!config().features.roomBrowser) {
      return c.json({ error: 'not found' }, 404);
    }
    return roomListBudget(c, next);
  });
  /** The client-error budget per address: 429 past it, before the body is read. */
  const clientErrorGate = addressBudget({
    perMinute: CLIENT_ERROR_REPORTS_PER_MINUTE_PER_IP,
    pruneEvery: CLIENT_ERROR_PRUNE_EVERY,
    now: deps.now,
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
      // A browser's own error report (error boundary, uncaught error), kept in the server log only.
      // The request's address is never written; the browser's text is cut to a fixed length. The
      // text is the error's own message, so it can say anything that error said; it is not
      // checked, only bounded.
      .post(
        '/client-errors',
        clientErrorGate,
        bodyLimit({
          maxSize: CLIENT_ERROR_BODY_MAX_BYTES,
          onError: (c) => c.json({ error: 'payload too large' }, 413),
        }),
        zValidator('json', clientErrorReportSchema),
        (c) => {
          const report = c.req.valid('json');
          // The logger keeps its own `message` key (it would drop a field of that name), so the
          // error's text goes under `error`.
          log.warn('client error', {
            source: report.source,
            path: report.path,
            build: report.build,
            error: report.message.slice(0, CLIENT_ERROR_LOG_MESSAGE_CHARS),
            stack: report.stack?.slice(0, CLIENT_ERROR_LOG_STACK_CHARS),
          });
          return c.body(null, 204);
        },
      )
  );
}
