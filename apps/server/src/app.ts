// Hono application: REST under /api, the game WebSocket under /ws.
import { Hono } from 'hono';
import { type ApiDeps, createApiRoutes, healthStatus } from './routes/api.ts';
import { createWsHandler } from './routes/ws.ts';

export type AppDeps = ApiDeps & { devLatencyMs: number };

export function createApp(deps: AppDeps) {
  return (
    new Hono()
      .route('/api', createApiRoutes(deps))
      // Unprefixed alias for container health checks.
      .get('/health', (c) => {
        const body = healthStatus(deps);
        return c.json(body, body.status === 'ok' ? 200 : 503);
      })
      .get('/ws', createWsHandler(deps))
  );
}

/** Type of the whole app, used by the client's typed `hc` client. */
export type AppType = ReturnType<typeof createApp>;
