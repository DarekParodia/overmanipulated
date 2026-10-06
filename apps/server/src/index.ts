// Authoritative game server entry point.
import { readEnv } from './env.ts';
import { startServer } from './server.ts';

const running = startServer(readEnv());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void running.stop().then(() => process.exit(0));
  });
}
