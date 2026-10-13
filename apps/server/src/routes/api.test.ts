import { describe, expect, it } from 'bun:test';
import { leaderboardResponseSchema, PROTOCOL_VERSION, publicConfigSchema } from '@redakcja/shared';
import { createFakeHub } from '../__fixtures__/fake-transport.ts';
import { createApp } from '../app.ts';
import { staticConfigStore } from '../config.ts';
import { openDatabase } from '../db/client.ts';
import { recordBlunderVote } from '../db/queries/blunder-votes.ts';
import { insertLeaderboardEntry } from '../db/queries/leaderboard.ts';
import { createRoomRegistry } from '../rooms/registry.ts';

function setup() {
  const db = openDatabase(':memory:');
  const registry = createRoomRegistry({ hub: createFakeHub().hub });
  return { db, app: createApp({ db, registry, devLatencyMs: 0 }) };
}

describe('REST routes', () => {
  it('GET /api/health reports ok with DB status and protocol version', async () => {
    const { app } = setup();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      db: 'ok',
      rooms: 0,
      protocolVersion: PROTOCOL_VERSION,
      config: { source: 'defaults', revision: 0 },
    });
  });

  it('GET /api/health reports where the running config came from and its revision', async () => {
    const db = openDatabase(':memory:');
    const registry = createRoomRegistry({ hub: createFakeHub().hub });
    const app = createApp({
      db,
      registry,
      devLatencyMs: 0,
      configMeta: () => ({ source: 'file', revision: 3 }),
    });
    const body = await (await app.request('/health')).json();
    expect(body).toMatchObject({ status: 'ok', config: { source: 'file', revision: 3 } });
  });

  it('GET /api/config serves the default public config, never cached', async () => {
    const { app } = setup();
    const res = await app.request('/api/config', { headers: { host: 'localhost:3000' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = publicConfigSchema.parse(await res.json());
    expect(body).toEqual({
      revision: 0,
      siteOrigin: null,
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
      defaultDifficulty: 'normal',
      motd: null,
      ads: { enabled: false },
    });
  });

  describe('GET /api/config with a config.json', () => {
    const store = staticConfigStore({
      ads: {
        enabled: true,
        client: 'ca-pub-1234567890123456',
        slots: { menu: '1111111111' },
        domains: ['bronsie.drkp.dev'],
        signOff: { by: 'Anna Nowak, opiekunka projektu', date: '2026-10-01' },
      },
      motd: { id: 'stara', text: 'Ten komunikat już wygasł.', until: '2020-01-01T00:00:00Z' },
    });
    function app(adsCspReady?: boolean) {
      return createApp({
        db: openDatabase(':memory:'),
        registry: createRoomRegistry({ hub: createFakeHub().hub }),
        devLatencyMs: 0,
        config: () => store.get(),
        configMeta: () => ({ source: 'file', revision: 4 }),
        ...(adsCspReady === undefined ? {} : { adsCspReady }),
      });
    }
    async function get(host: string, adsCspReady?: boolean) {
      const res = await app(adsCspReady).request('/api/config', { headers: { host } });
      expect(res.status).toBe(200);
      return publicConfigSchema.parse(await res.json());
    }

    it('enables ads only for a configured host (port and case ignored)', async () => {
      const body = await get('Bronsie.DRKP.dev:443');
      expect(body.revision).toBe(4);
      expect(body.ads).toEqual({
        enabled: true,
        mode: 'limited',
        client: 'ca-pub-1234567890123456',
        slots: { menu: '1111111111' },
        ageTreatment: 'teen',
      });
      expect((await get('localhost:5173')).ads).toEqual({ enabled: false });
      expect((await get('drkp.dev')).ads).toEqual({ enabled: false });
    });

    it('keeps ads off when the shell cannot carry the ads CSP', async () => {
      expect((await get('bronsie.drkp.dev', false)).ads).toEqual({ enabled: false });
    });

    it('drops an expired message of the day', async () => {
      expect((await get('bronsie.drkp.dev')).motd).toBeNull();
    });
  });

  it('GET /health is an alias for container checks', async () => {
    const { app } = setup();
    expect((await app.request('/health')).status).toBe(200);
  });

  it('GET /api/health reports degraded when the DB is closed', async () => {
    const { app, db } = setup();
    db.$client.close();
    const res = await app.request('/api/health');
    expect(res.status).toBe(503);
  });

  it('GET /api/leaderboard returns global entries in the wire format', async () => {
    const { app, db } = setup();
    insertLeaderboardEntry(db, { roomCode: 'ABCD', players: ['Ala'], score: 42, survivedS: 300 });
    insertLeaderboardEntry(db, {
      roomCode: 'WXYZ',
      players: ['Ola', 'Ewa'],
      score: 90,
      survivedS: 480,
    });
    const res = await app.request('/api/leaderboard');
    expect(res.status).toBe(200);
    const body = leaderboardResponseSchema.parse(await res.json());
    expect(body.scope).toBe('global');
    expect(body.entries.map((e) => [e.roomCode, e.score, e.survivedS])).toEqual([
      ['WXYZ', 90, 480],
      ['ABCD', 42, 300],
    ]);
    expect(body.entries[0]?.players).toEqual(['Ola', 'Ewa']);
  });

  it('GET /api/leaderboard scopes to a room and honours limit', async () => {
    const { app, db } = setup();
    for (const score of [1, 2, 3]) {
      insertLeaderboardEntry(db, { roomCode: 'ABCD', players: ['Ala'], score, survivedS: 10 });
    }
    insertLeaderboardEntry(db, { roomCode: 'WXYZ', players: ['Ola'], score: 99, survivedS: 10 });
    const res = await app.request('/api/leaderboard?scope=room&room=abcd&limit=2');
    const body = leaderboardResponseSchema.parse(await res.json());
    expect(body.scope).toBe('room');
    expect(body.entries.map((e) => e.score)).toEqual([3, 2]);
  });

  it('GET /api/leaderboard validates the query', async () => {
    const { app } = setup();
    expect((await app.request('/api/leaderboard?scope=cheat')).status).toBe(400);
    expect((await app.request('/api/leaderboard?limit=500')).status).toBe(400);
    expect((await app.request('/api/leaderboard?scope=room')).status).toBe(400);
  });

  it('GET /api/stats/blunders returns vote counts per story for a level', async () => {
    const { app, db } = setup();
    for (const storyId of ['s1', 's2', 's2']) {
      recordBlunderVote(db, { levelId: 'l1-sygnal', storyId, previousId: null });
    }
    recordBlunderVote(db, { levelId: 'l0-greybox', storyId: 's1', previousId: null });
    const res = await app.request('/api/stats/blunders?levelId=l1-sygnal');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      levelId: 'l1-sygnal',
      stories: [
        { storyId: 's2', votes: 2 },
        { storyId: 's1', votes: 1 },
      ],
    });
  });

  it('GET /api/stats/blunders requires a level id', async () => {
    const { app } = setup();
    expect((await app.request('/api/stats/blunders')).status).toBe(400);
    expect((await app.request('/api/stats/blunders?levelId=')).status).toBe(400);
    expect((await app.request(`/api/stats/blunders?levelId=${'x'.repeat(65)}`)).status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    const { app } = setup();
    expect((await app.request('/api/nope')).status).toBe(404);
  });
});
