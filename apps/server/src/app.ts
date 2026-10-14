// Hono application: REST under /api, the game WebSocket under /ws, and last the pages the server
// renders itself (HTML shell, /ads.txt).
import { Hono } from 'hono';
import { DEFAULT_SERVER_CONFIG } from './config.ts';
import { type ApiDeps, createApiRoutes, DEFAULT_CONFIG_META, healthStatus } from './routes/api.ts';
import { createShellRoutes } from './routes/shell.ts';
import { createWsHandler } from './routes/ws.ts';
import { adsCspReady, NO_SHELL, type ShellAssets } from './shell/assets.ts';

export type AppDeps = ApiDeps & {
  devLatencyMs: number;
  /** Built client page for the HTML shell (S7-70); absent: no shell, those paths 404. */
  shell?: ShellAssets;
};

export function createApp(deps: AppDeps) {
  const shell = deps.shell ?? NO_SHELL;
  const apiDeps: ApiDeps = { ...deps, adsCspReady: deps.adsCspReady ?? adsCspReady(shell) };
  return (
    new Hono()
      .route('/api', createApiRoutes(apiDeps))
      // Unprefixed alias for container health checks.
      .get('/health', (c) => {
        const body = healthStatus(deps);
        return c.json(body, body.status === 'ok' ? 200 : 503);
      })
      .get('/ws', createWsHandler(deps))
      // Last: its catch-all must never shadow a route above.
      .route(
        '/',
        createShellRoutes({
          config: deps.config ?? (() => DEFAULT_SERVER_CONFIG),
          configMeta: deps.configMeta ?? (() => DEFAULT_CONFIG_META),
          shell,
        }),
      )
  );
}

/** Type of the whole app, used by the client's typed `hc` client. */
export type AppType = ReturnType<typeof createApp>;
