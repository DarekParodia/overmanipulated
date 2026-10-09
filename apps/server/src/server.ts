// Wires registry, loop, database and Hono app into a running Bun server.
import { websocket } from '@hono/bun';
import type { Server } from 'bun';
import { createApp } from './app.ts';
import { type Db, openDatabase } from './db/client.ts';
import { deleteExpiredBlunderVotes, recordBlunderVote } from './db/queries/blunder-votes.ts';
import { deleteExpiredEntries } from './db/queries/leaderboard.ts';
import type { Env } from './env.ts';
import { log } from './log.ts';
import { createGameLoop } from './loop.ts';
import { createRoomRegistry } from './rooms/registry.ts';
import { delayed } from './routes/ws.ts';

const RETENTION_SWEEP_MS = 60 * 60 * 1000;

export type RunningServer = {
  server: Server<unknown>;
  db: Db;
  stop(): Promise<void>;
};

export function startServer(env: Env): RunningServer {
  const db = openDatabase(env.DATABASE_PATH);
  let server: Server<unknown> | null = null;
  const registry = createRoomRegistry({
    hub: {
      publish: (topic, data) => delayed(env.DEV_LATENCY_MS, () => server?.publish(topic, data)),
    },
    onActive: () => loop.start(),
    briefingMs: env.BRIEFING_MS,
    recordBlunderVote: (vote) => recordBlunderVote(db, vote),
  });
  const loop = createGameLoop(registry);
  const app = createApp({ db, registry, devLatencyMs: env.DEV_LATENCY_MS });

  server = Bun.serve({ port: env.PORT, fetch: app.fetch, websocket });

  const sweep = () => {
    const removed = deleteExpiredEntries(db);
    if (removed > 0) {
      log.info('expired leaderboard entries removed', { removed });
    }
    const removedVotes = deleteExpiredBlunderVotes(db);
    if (removedVotes > 0) {
      log.info('expired blunder votes removed', { removed: removedVotes });
    }
  };
  sweep();
  const sweepTimer = setInterval(sweep, RETENTION_SWEEP_MS);

  log.info('server listening', { port: server.port, devLatencyMs: env.DEV_LATENCY_MS });
  const running = server;
  return {
    server: running,
    db,
    async stop() {
      clearInterval(sweepTimer);
      loop.stop();
      await running.stop(true);
      db.$client.close();
    },
  };
}
