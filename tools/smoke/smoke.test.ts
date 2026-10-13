// Runs the smoke script against a locally started game server behind a tiny stand-in for Caddy
// (static page, /api, /health and a /ws pass-through), so the whole script is exercised.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer } from '../../apps/server/src/server.ts';
import { linkedAssets, runSmoke, websocketUrl } from './smoke.ts';

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-abcd1234.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abcd1234.css">
<link rel="icon" href="/icons/icon.svg">
</head><body><div id="root"></div></body></html>`;

type Upstream = { upstream?: WebSocket; queue: string[] };

let game: ReturnType<typeof startServer>;
let front: ReturnType<typeof Bun.serve<Upstream>>;
let baseUrl: string;

beforeAll(() => {
  game = startServer({ PORT: 0, DATABASE_PATH: ':memory:', DEV_LATENCY_MS: 0, BRIEFING_MS: 5000 });
  const backend = `localhost:${game.server.port}`;
  front = Bun.serve<Upstream>({
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === '/ws') {
        return server.upgrade(request, { data: { queue: [] } })
          ? undefined
          : new Response('upgrade failed', { status: 400 });
      }
      if (url.pathname === '/api/health' || url.pathname === '/health') {
        return fetch(`http://${backend}${url.pathname}`);
      }
      if (url.pathname === '/api/leaderboard') {
        return fetch(`http://${backend}${url.pathname}${url.search}`);
      }
      if (url.pathname === '/') {
        return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (url.pathname.endsWith('.js')) {
        return new Response('console.log(1)', {
          headers: {
            'content-type': 'text/javascript',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        });
      }
      if (url.pathname.endsWith('.css')) {
        return new Response('body{}', { headers: { 'content-type': 'text/css' } });
      }
      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(client) {
        const upstream = new WebSocket(`ws://${backend}/ws`);
        client.data.upstream = upstream;
        upstream.addEventListener('open', () => {
          for (const queued of client.data.queue.splice(0)) {
            upstream.send(queued);
          }
        });
        upstream.addEventListener('message', (event) => client.send(String(event.data)));
        upstream.addEventListener('close', () => client.close());
      },
      message(client, message) {
        const { upstream, queue } = client.data;
        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.send(String(message));
        } else {
          queue.push(String(message));
        }
      },
      close(client) {
        client.data.upstream?.close();
      },
    },
  });
  baseUrl = `http://localhost:${front.port}`;
});

afterAll(async () => {
  front.stop(true);
  await game.stop();
});

describe('smoke helpers', () => {
  it('maps the base URL to the WebSocket URL', () => {
    expect(websocketUrl(new URL('https://gra.example.pl'))).toBe('wss://gra.example.pl/ws');
    expect(websocketUrl(new URL('http://localhost:8080/'))).toBe('ws://localhost:8080/ws');
  });

  it('finds scripts and stylesheets but not external or icon links', () => {
    expect(linkedAssets(HTML)).toEqual(['/assets/index-abcd1234.js', '/assets/index-abcd1234.css']);
    expect(linkedAssets('<script src="https://cdn.example/x.js"></script>')).toEqual([]);
  });
});

describe('smoke run', () => {
  it('passes the full flow through the front URL', async () => {
    const results = await runSmoke(baseUrl, { snapshots: 5 });
    const failed = results.filter((r) => r.status === 'fail');
    expect(failed).toEqual([]);
    expect(results.map((r) => r.name)).toContain('start level and receive snapshots');
    // The stand-in sends no security headers, so that is reported as a warning, not a failure.
    expect(results.find((r) => r.name === 'GET / (HTML)')?.status).toBe('warn');
  }, 30_000);

  it('fails strict mode when security headers are missing', async () => {
    const results = await runSmoke(baseUrl, { strict: true, snapshots: 2 });
    expect(results.find((r) => r.name === 'GET / (HTML)')?.status).toBe('fail');
  }, 30_000);

  it('reports a failure, not a crash, when nothing listens', async () => {
    const results = await runSmoke('http://localhost:1', { snapshots: 1 });
    expect(results.some((r) => r.status === 'fail')).toBe(true);
    expect(results.find((r) => r.name.startsWith('WebSocket opens'))?.status).toBe('fail');
  }, 30_000);
});
