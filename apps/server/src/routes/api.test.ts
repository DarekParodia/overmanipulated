import { describe, expect, it, spyOn } from 'bun:test';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlags,
  leaderboardResponseSchema,
  PROTOCOL_VERSION,
  publicConfigSchema,
  type RoomListResponse,
  roomListResponseSchema,
} from '@redakcja/shared';
import { createFakeHub } from '../__fixtures__/fake-transport.ts';
import { createRoomHarness } from '../__fixtures__/room-helpers.ts';
import { createApp } from '../app.ts';
import { DEFAULT_SERVER_CONFIG, staticConfigStore } from '../config.ts';
import { openDatabase } from '../db/client.ts';
import { recordBlunderVote } from '../db/queries/blunder-votes.ts';
import { insertLeaderboardEntry } from '../db/queries/leaderboard.ts';
import { CLIENT_ERROR_BODY_MAX_BYTES, CLIENT_ERROR_REPORTS_PER_MINUTE_PER_IP } from '../limits.ts';
import { log } from '../log.ts';
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

  it('GET /api/leaderboard lists one difficulty, normal by default', async () => {
    const { app, db } = setup();
    insertLeaderboardEntry(db, { roomCode: 'ABCD', players: ['Ala'], score: 42, survivedS: 300 });
    insertLeaderboardEntry(db, {
      roomCode: 'WXYZ',
      players: ['Ola'],
      score: 90,
      survivedS: 480,
      difficulty: 'hard',
    });
    insertLeaderboardEntry(db, {
      roomCode: 'ABCD',
      players: ['Ewa'],
      score: 15,
      survivedS: 60,
      difficulty: 'hard',
    });
    const plain = leaderboardResponseSchema.parse(
      await (await app.request('/api/leaderboard')).json(),
    );
    expect(plain.entries.map((e) => [e.roomCode, e.score, e.difficulty])).toEqual([
      ['ABCD', 42, 'normal'],
    ]);
    const hard = leaderboardResponseSchema.parse(
      await (await app.request('/api/leaderboard?difficulty=hard')).json(),
    );
    expect(hard.entries.map((e) => [e.roomCode, e.score, e.difficulty])).toEqual([
      ['WXYZ', 90, 'hard'],
      ['ABCD', 15, 'hard'],
    ]);
    const hardRoom = leaderboardResponseSchema.parse(
      await (await app.request('/api/leaderboard?scope=room&room=ABCD&difficulty=hard')).json(),
    );
    expect(hardRoom.entries.map((e) => e.score)).toEqual([15]);
    const expert = leaderboardResponseSchema.parse(
      await (await app.request('/api/leaderboard?difficulty=expert')).json(),
    );
    expect(expert.entries).toEqual([]);
  });

  it('GET /api/leaderboard validates the query', async () => {
    const { app } = setup();
    expect((await app.request('/api/leaderboard?difficulty=insane')).status).toBe(400);
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

/**
 * The room browser on: a harness registry and the app share one clock, which drives the list
 * cache and the per-address limiter. `features` overrides the flags both read.
 */
function roomBrowser(features: Partial<FeatureFlags> = {}) {
  const flags: FeatureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    roomBrowser: true,
    spectators: true,
    ...features,
  };
  const harness = createRoomHarness({
    settings: () => ({ maxRooms: 50, features: flags, defaultDifficulty: DEFAULT_DIFFICULTY }),
  });
  const app = createApp({
    db: openDatabase(':memory:'),
    registry: harness.registry,
    devLatencyMs: 0,
    config: () => ({ ...DEFAULT_SERVER_CONFIG, features: flags }),
    now: () => harness.clock.time,
  });

  /** A room hosted by `nickname`, made public unless `visibility` says otherwise. */
  function room(
    nickname: string,
    options: { visibility?: 'public' | 'private'; name?: string } = {},
  ) {
    const host = harness.join(nickname, { clientId: `${nickname}-browser-0001`.padEnd(16, 'x') });
    const code = harness.welcomeOf(host).roomCode;
    if ((options.visibility ?? 'public') === 'public') {
      harness.lobby(host, { kind: 'setVisibility', visibility: 'public' });
    }
    if (options.name !== undefined) {
      harness.lobby(host, { kind: 'setRoomName', name: options.name });
    }
    return { host, code };
  }

  async function list(query = '', ip = '10.0.0.1'): Promise<RoomListResponse> {
    const res = await app.request(`/api/rooms${query}`, { headers: { 'x-real-ip': ip } });
    expect(res.status).toBe(200);
    return roomListResponseSchema.parse(await res.json());
  }

  /** Past the list cache, so the next request sees the rooms as they are now. */
  function expireCache() {
    harness.clock.time += 2000;
  }

  return { harness, app, room, list, expireCache };
}

describe('GET /api/rooms', () => {
  it('is 404 while the roomBrowser flag is off (the default)', async () => {
    const { app } = setup();
    const res = await app.request('/api/rooms');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });

    const off = roomBrowser({ roomBrowser: false });
    off.room('Ola');
    expect((await off.app.request('/api/rooms?limit=5')).status).toBe(404);
    // A bad query is still a 404, not a 400: the route does not exist.
    expect((await off.app.request('/api/rooms?limit=0')).status).toBe(404);
  });

  it('lists public rooms only, and only while someone is connected', async () => {
    const browser = roomBrowser();
    const listed = browser.room('Ola');
    browser.room('Bartek', { visibility: 'private' });
    const dropped = browser.room('Celina');
    browser.harness.registry.handleDisconnect(dropped.host, false);

    const body = await browser.list();
    expect(body.total).toBe(1);
    expect(body.rooms.map((r) => r.code)).toEqual([listed.code]);
    expect(browser.harness.registry.roomCount).toBe(3);
  });

  it('describes a room with every summary field', async () => {
    const browser = roomBrowser();
    const { host, code } = browser.room('Ola', { name: '3B Piątek' });
    browser.harness.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    browser.harness.join('Bartek', { code });
    browser.harness.join('Widz', { code, as: 'spectator' });

    expect(await browser.list()).toEqual({
      rooms: [
        {
          code,
          name: '3B Piątek',
          hostNickname: 'Ola',
          levelId: 'l0-greybox',
          mode: 'coop',
          difficulty: 'normal',
          players: 2,
          maxPlayers: 4,
          spectators: 1,
          spectatorsAllowed: true,
          inGame: false,
          canJoinAsPlayer: true,
          canSpectate: true,
          createdAt: 1_700_000_000_000,
        },
      ],
      total: 1,
    });
  });

  it('masks a blocked host nickname, seats 8 in versus and closes full rooms', async () => {
    const browser = roomBrowser();
    const { host, code } = browser.room('kurw4 7');
    browser.harness.lobby(host, { kind: 'setMode', mode: 'versus' });
    for (const nickname of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      browser.harness.join(`Gracz ${nickname}`, { code });
    }
    expect((await browser.list()).rooms[0]).toMatchObject({
      hostNickname: '*******',
      mode: 'versus',
      players: 8,
      maxPlayers: 8,
      spectators: 0,
      // The Widownia is closed by default.
      spectatorsAllowed: false,
      canJoinAsPlayer: false,
      canSpectate: false,
    });
  });

  it('offers spectating only while the spectators flag is on and the Widownia has room', async () => {
    const off = roomBrowser({ spectators: false });
    const first = off.room('Ola');
    off.harness.lobby(first.host, { kind: 'setSpectatorsAllowed', allowed: true });
    expect((await off.list()).rooms[0]).toMatchObject({
      spectatorsAllowed: false,
      canSpectate: false,
    });

    const full = roomBrowser();
    const second = full.room('Ola');
    full.harness.lobby(second.host, { kind: 'setSpectatorsAllowed', allowed: true });
    for (let i = 1; i <= 8; i++) {
      full.harness.join(`Widz ${i}`, { code: second.code, as: 'spectator' });
    }
    expect((await full.list()).rooms[0]).toMatchObject({
      spectators: 8,
      spectatorsAllowed: true,
      canSpectate: false,
    });
  });

  it('searches the code, name and host nickname with Polish letters folded', async () => {
    const browser = roomBrowser();
    const named = browser.room('Ola', { name: '3B Piątek' });
    browser.harness.clock.time += 10;
    const lukasz = browser.room('Łukasz Żółć');
    const codes = async (q: string) =>
      (await browser.list(`?q=${encodeURIComponent(q)}`)).rooms.map((r) => r.code);

    expect(await codes('piatek')).toEqual([named.code]);
    expect(await codes('3b PIĄTEK')).toEqual([named.code]);
    expect(await codes('lukasz zolc')).toEqual([lukasz.code]);
    expect(await codes('ŻÓŁĆ')).toEqual([lukasz.code]);
    expect(await codes(named.code.toLowerCase())).toEqual([named.code]);
    expect(await codes('   ')).toEqual([lukasz.code, named.code]);
    expect(await browser.list('?q=nikt')).toEqual({ rooms: [], total: 0 });
    // Longer than the search box allows.
    expect((await browser.app.request(`/api/rooms?q=${'a'.repeat(25)}`)).status).toBe(400);
  });

  it('filters by mode, level, difficulty and status', async () => {
    const browser = roomBrowser();
    const coop = browser.room('Ola');
    browser.harness.clock.time += 10;
    const versus = browser.room('Bartek');
    browser.harness.lobby(versus.host, { kind: 'setMode', mode: 'versus' });
    browser.harness.lobby(versus.host, { kind: 'selectLevel', levelId: 'l1-burza' });
    browser.harness.lobby(versus.host, { kind: 'setDifficulty', difficulty: 'hard' });
    browser.harness.clock.time += 10;
    const playing = browser.room('Celina');
    browser.harness.startPastBriefing(playing.host);
    browser.expireCache();
    const codes = async (query: string) => (await browser.list(query)).rooms.map((r) => r.code);

    expect(await codes('?mode=versus')).toEqual([versus.code]);
    expect(await codes('?mode=coop')).toEqual([coop.code, playing.code]);
    expect(await codes('?levelId=l1-burza')).toEqual([versus.code]);
    expect(await codes('?difficulty=hard')).toEqual([versus.code]);
    expect(await codes('?difficulty=normal')).toEqual([coop.code, playing.code]);
    expect(await codes('?status=inGame')).toEqual([playing.code]);
    expect(await codes('?status=open')).toEqual([versus.code, coop.code]);
    expect(await codes('?mode=coop&status=open')).toEqual([coop.code]);
    expect((await browser.app.request('/api/rooms?mode=solo')).status).toBe(400);
    expect((await browser.app.request('/api/rooms?status=closed')).status).toBe(400);
  });

  it('lists joinable rooms first, then the newest, up to the limit', async () => {
    const browser = roomBrowser();
    const oldest = browser.room('Ola');
    browser.harness.clock.time += 10;
    const middle = browser.room('Bartek');
    browser.harness.clock.time += 10;
    const newest = browser.room('Celina');
    browser.harness.startPastBriefing(newest.host);
    browser.expireCache();

    const all = await browser.list();
    expect(all.rooms.map((r) => r.code)).toEqual([middle.code, oldest.code, newest.code]);
    expect(all.total).toBe(3);
    const two = await browser.list('?limit=2');
    expect(two.rooms.map((r) => r.code)).toEqual([middle.code, oldest.code]);
    expect(two.total).toBe(3);
    expect((await browser.app.request('/api/rooms?limit=51')).status).toBe(400);
  });

  it('closes the player seat of a room in the playing phase', async () => {
    const browser = roomBrowser();
    const { host } = browser.room('Ola');
    browser.harness.startPastBriefing(host);
    expect((await browser.list()).rooms[0]).toMatchObject({
      players: 1,
      inGame: true,
      canJoinAsPlayer: false,
    });
  });

  it('serves 30 polls from one IP within 10 s and rebuilds the list at most 5 times', async () => {
    const browser = roomBrowser();
    browser.room('Ola');
    const before = browser.harness.registry.roomListBuilds;
    for (let poll = 0; poll < 30; poll++) {
      expect((await browser.list('', '203.0.113.7')).total).toBe(1);
      browser.harness.clock.time += 333;
    }
    expect(browser.harness.registry.roomListBuilds - before).toBe(5);
  });

  it('shows a change once the 2 s cache expires', async () => {
    const browser = roomBrowser();
    browser.room('Ola');
    expect((await browser.list()).total).toBe(1);
    browser.room('Bartek');
    browser.harness.clock.time += 1999;
    expect((await browser.list()).total).toBe(1);
    browser.harness.clock.time += 1;
    expect((await browser.list()).total).toBe(2);
  });

  it('answers request 601 from one IP with 429 while another IP still gets 200', async () => {
    const browser = roomBrowser();
    browser.room('Ola');
    for (let i = 0; i < 600; i++) {
      const res = await browser.app.request('/api/rooms', {
        headers: { 'x-real-ip': '198.51.100.1' },
      });
      expect(res.status).toBe(200);
    }
    const limited = await browser.app.request('/api/rooms', {
      headers: { 'x-real-ip': '198.51.100.1' },
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'too many requests' });
    expect((await browser.list('', '198.51.100.2')).total).toBe(1);
    // The bucket refills 10 a second.
    browser.harness.clock.time += 100;
    expect((await browser.list('', '198.51.100.1')).total).toBe(1);
  });
});

describe('POST /api/client-errors', () => {
  const report = { message: 'Cannot read properties of undefined', source: 'boundary', path: '/' };

  /**
   * An app on a fixed clock, so the per-address budget does not refill while a test runs. The
   * logger is spied per test: the test preload silences it.
   */
  function reporting() {
    const app = createApp({
      db: openDatabase(':memory:'),
      registry: createRoomRegistry({ hub: createFakeHub().hub }),
      devLatencyMs: 0,
      now: () => 0,
    });
    const send = (body: unknown, ip = '10.0.0.1') =>
      app.request('/api/client-errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': ip },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
    return { send };
  }

  it('answers 204 to a valid report and logs what it says, never the address', async () => {
    const { send } = reporting();
    const warn = spyOn(log, 'warn').mockImplementation(() => {});
    try {
      const full = { ...report, stack: 'Error: boom\n    at App', build: '0.0.0+1a2b3c4' };
      const res = await send(full, '203.0.113.9');
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(warn.mock.calls).toEqual([
        [
          'client error',
          {
            source: 'boundary',
            path: '/',
            build: '0.0.0+1a2b3c4',
            error: 'Cannot read properties of undefined',
            stack: 'Error: boom\n    at App',
          },
        ],
      ]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('203.0.113.9');
    } finally {
      warn.mockRestore();
    }
  });

  it('cuts the logged message to 200 characters and the stack to 500', async () => {
    const { send } = reporting();
    const warn = spyOn(log, 'warn').mockImplementation(() => {});
    try {
      const long = { ...report, message: 'x'.repeat(500), stack: 'y'.repeat(2000) };
      expect((await send(long)).status).toBe(204);
      expect(warn.mock.calls).toEqual([
        [
          'client error',
          {
            source: 'boundary',
            path: '/',
            error: 'x'.repeat(200),
            stack: 'y'.repeat(500),
          },
        ],
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('answers 400 to a report that does not match the schema', async () => {
    const { send } = reporting();
    expect((await send({ ...report, source: 'console' })).status).toBe(400);
    expect((await send({ source: 'window', path: '/' })).status).toBe(400);
    expect((await send({ ...report, path: '/?room=ABCD' })).status).toBe(400);
    expect((await send('{ not json')).status).toBe(400);
  });

  it('answers 413 to a body over the size limit', async () => {
    const { send } = reporting();
    const res = await send({ ...report, stack: 'x'.repeat(CLIENT_ERROR_BODY_MAX_BYTES) });
    expect(res.status).toBe(413);
  });

  it('answers 429 past the per-address budget, while another address still gets 204', async () => {
    const { send } = reporting();
    const warn = spyOn(log, 'warn').mockImplementation(() => {});
    try {
      for (let i = 0; i < CLIENT_ERROR_REPORTS_PER_MINUTE_PER_IP; i++) {
        expect((await send(report, '198.51.100.7')).status).toBe(204);
      }
      const limited = await send(report, '198.51.100.7');
      expect(limited.status).toBe(429);
      expect(await limited.json()).toEqual({ error: 'too many requests' });
      expect((await send(report, '198.51.100.8')).status).toBe(204);
    } finally {
      warn.mockRestore();
    }
  });
});
