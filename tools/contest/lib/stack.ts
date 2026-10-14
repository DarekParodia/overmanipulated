// Starts a private game stack (server + Vite preview of the production build) on free ports for
// the screenshot and video generators, and stops it by PID afterwards. `CONTEST_BASE_URL`
// (e.g. http://localhost:4173) skips this and uses a stack that is already running.
import { existsSync } from 'node:fs';
import { ROOT } from './common.ts';

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = probe.port;
  await probe.stop(true);
  if (port === undefined) {
    throw new Error('no free port');
  }
  return port;
}

async function waitFor(url: string, ms = 60_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await Bun.sleep(300);
  }
  throw new Error(`timed out waiting for ${url}`);
}

export type Stack = { baseUrl: string; stop(): Promise<void> };

export async function startStack(options: { briefingMs?: number } = {}): Promise<Stack> {
  const existing = process.env.CONTEST_BASE_URL;
  if (existing) {
    return { baseUrl: existing, async stop() {} };
  }
  if (!existsSync(`${ROOT}/apps/client/dist/index.html`) || process.env.CONTEST_REBUILD === '1') {
    const build = Bun.spawn(['bun', 'run', 'build'], {
      cwd: ROOT,
      stdout: 'ignore',
      stderr: 'inherit',
    });
    if ((await build.exited) !== 0) {
      throw new Error('client build failed');
    }
  }
  const serverPort = await freePort();
  const webPort = await freePort();
  const server = Bun.spawn(['bun', 'apps/server/src/index.ts'], {
    cwd: ROOT,
    stdout: 'ignore',
    stderr: 'inherit',
    env: {
      ...process.env,
      PORT: String(serverPort),
      DATABASE_PATH: ':memory:',
      LOG_LEVEL: 'silent',
      // The room browser is off by default (S7-88); the screenshots show it.
      CONFIG_PATH: `${ROOT}/tools/contest/server-config.json`,
      ...(options.briefingMs === undefined ? {} : { BRIEFING_MS: String(options.briefingMs) }),
    },
  });
  const preview = Bun.spawn(
    ['./node_modules/.bin/vite', 'preview', '--port', String(webPort), '--strictPort'],
    {
      cwd: `${ROOT}/apps/client`,
      stdout: 'ignore',
      stderr: 'inherit',
      env: { ...process.env, GAME_SERVER: `localhost:${serverPort}` },
    },
  );
  await waitFor(`http://localhost:${serverPort}/health`);
  await waitFor(`http://localhost:${webPort}/`);
  return {
    baseUrl: `http://localhost:${webPort}`,
    async stop() {
      server.kill();
      preview.kill();
      await Promise.all([server.exited, preview.exited]);
    },
  };
}
