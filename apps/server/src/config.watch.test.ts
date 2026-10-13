// config.json reload on the real file system and in the real entry point: fs.watch on the
// directory (plain and atomic saves), SIGHUP, and exit code 1 on an invalid file at startup.
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { type ConfigStore, createConfigStore } from './config.ts';

const WAIT_TIMEOUT_MS = 5000;
const POLL_MS = 25;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redakcja-config-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function waitFor(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function watchedStore(path: string): ConfigStore {
  const store = createConfigStore({ path });
  cleanups.unshift(() => store.close());
  return store;
}

describe('config.json watch on the file system', () => {
  it('reloads after a plain write', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '{}');
    const store = watchedStore(path);
    writeFileSync(path, '{"rooms": {"maxRooms": 11}}');
    await waitFor(() => store.get().rooms.maxRooms === 11, 'the write to reload');
    expect(store.revision).toBe(1);
  });

  it('reloads after an atomic save (write elsewhere, rename over)', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '{}');
    const store = watchedStore(path);
    writeFileSync(join(dir, 'config.json.tmp'), '{"features": {"roomBrowser": true}}');
    renameSync(join(dir, 'config.json.tmp'), path);
    await waitFor(() => store.get().features.roomBrowser, 'the rename to reload');
  });

  it('keeps the old config after an invalid write, then takes the next valid one', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '{"rooms": {"maxRooms": 5}}');
    const store = watchedStore(path);
    writeFileSync(path, '{"rooms": {"maxRooms": ');
    // Longer than the debounce, so the invalid text was read and refused.
    await Bun.sleep(600);
    expect(store.get().rooms.maxRooms).toBe(5);
    writeFileSync(path, '{"rooms": {"maxRooms": 6}}');
    await waitFor(() => store.get().rooms.maxRooms === 6, 'the valid write to reload');
  });
});

/** A free TCP port: the entry point reads PORT from env, where 0 is not allowed. */
function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  void probe.stop(true);
  if (port === undefined) throw new Error('no free port');
  return port;
}

const ENTRY = join(import.meta.dir, 'index.ts');

function startEntry(configPath: string, port: number) {
  const child = Bun.spawn(['bun', ENTRY], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: ':memory:',
      CONFIG_PATH: configPath,
      LOG_LEVEL: 'silent',
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  cleanups.unshift(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  return child;
}

const healthConfigSchema = z.object({
  config: z.object({ source: z.string(), revision: z.number() }),
});

async function healthConfig(port: number): Promise<{ source: string; revision: number } | null> {
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    return healthConfigSchema.parse(await res.json()).config;
  } catch {
    return null;
  }
}

describe('server entry point', () => {
  it('exits with code 1 on an invalid config file', async () => {
    const dir = tempDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '{"ads": {"enabled": true}}');
    const child = startEntry(path, freePort());
    expect(await child.exited).toBe(1);
  });

  it('reloads on SIGHUP and reports the revision in /health', async () => {
    // CONFIG_PATH is a symlink into another directory: writes to the target raise no event in
    // the watched directory, so only SIGHUP can pick them up.
    const dir = tempDir();
    mkdirSync(join(dir, 'real'));
    mkdirSync(join(dir, 'mounted'));
    const target = join(dir, 'real', 'config.json');
    const path = join(dir, 'mounted', 'config.json');
    writeFileSync(target, '{}');
    symlinkSync(target, path);
    const port = freePort();
    const child = startEntry(path, port);

    await waitFor(async () => (await healthConfig(port)) !== null, 'the server to start');
    expect(await healthConfig(port)).toEqual({ source: 'file', revision: 0 });

    writeFileSync(target, '{"rooms": {"maxRooms": 8}}');
    await Bun.sleep(400);
    expect(await healthConfig(port)).toEqual({ source: 'file', revision: 0 });

    child.kill('SIGHUP');
    await waitFor(async () => (await healthConfig(port))?.revision === 1, 'SIGHUP to reload');
    expect(await healthConfig(port)).toEqual({ source: 'file', revision: 1 });
    expect(child.exitCode).toBeNull();

    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
  });
});
