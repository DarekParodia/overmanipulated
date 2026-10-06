import { describe, expect, it } from 'bun:test';
import { PROTOCOL_VERSION } from '@redakcja/shared';
import { createFakeHub } from '../__fixtures__/fake-transport.ts';
import { createApp } from '../app.ts';
import { openDatabase } from '../db/client.ts';
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

  it('GET /api/leaderboard returns entries', async () => {
    const { app, db } = setup();
    insertLeaderboardEntry(db, {
      roomCode: 'ABCD',
      mode: 'endless',
      levelId: 'endless',
      score: 42,
      nicknames: ['Ala'],
    });
    const res = await app.request('/api/leaderboard?mode=endless');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { score: number }[] };
    expect(body.entries.map((e) => e.score)).toEqual([42]);
  });

  it('GET /api/leaderboard validates the query', async () => {
    const { app } = setup();
    expect((await app.request('/api/leaderboard?mode=cheat')).status).toBe(400);
    expect((await app.request('/api/leaderboard?mode=endless&limit=500')).status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    const { app } = setup();
    expect((await app.request('/api/nope')).status).toBe(404);
  });
});
