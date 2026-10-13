// Authoritative game server entry point.
import { type ConfigStore, createConfigStore, reloadOnSignal } from './config.ts';
import { readEnv } from './env.ts';
import { log } from './log.ts';
import { DEFAULT_CONFIG_PATH } from './paths.ts';
import { startServer } from './server.ts';

const env = readEnv();

let config: ConfigStore;
try {
  config = createConfigStore({
    path: env.CONFIG_PATH ?? DEFAULT_CONFIG_PATH,
    overrides: { adsEnabled: env.ADS_ENABLED },
  });
} catch (error) {
  // A typo must not silently start a server with ads, flags or limits the operator did not mean.
  log.error('invalid config file, refusing to start', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

const running = startServer(env, { config });
// `docker compose kill -s SIGHUP server` (compose `init: true` forwards it); file saves reload too.
const stopSignalReload = reloadOnSignal(config, process);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopSignalReload();
    config.close();
    void running.stop().then(() => process.exit(0));
  });
}
