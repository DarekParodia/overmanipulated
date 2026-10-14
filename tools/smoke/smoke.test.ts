// Runs the smoke script against a locally started game server behind a tiny stand-in for Caddy
// (static assets and manifest, everything else proxied to the game server, a /ws pass-through), so
// the whole script is exercised: once with ads off (base CSP) and once with ads on for localhost
// (nonce CSP), plus a front that answers every page with the static index.html (server down).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type ServerConfigInput, staticConfigStore } from '../../apps/server/src/config.ts';
import { startServer } from '../../apps/server/src/server.ts';
import { CSP_NONCE_PLACEHOLDER } from '../../packages/shared/src/index.ts';
import {
  type CheckResult,
  cspDirective,
  embeddedConfig,
  linkedAssets,
  moduleScriptNonce,
  runSmoke,
  websocketUrl,
} from './smoke.ts';

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-abcd1234.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abcd1234.css">
<link rel="icon" href="/icons/icon.svg">
</head><body><div id="root"></div></body></html>`;

/** A privacy note with the ads blocks of docs/privacy.pl.md. */
const PRIVACY_MD =
  '# Prywatność\n\n<!-- ads -->\nReklamy.\n<!-- /ads -->\n<!-- no-ads -->\nBez reklam.\n<!-- /no-ads -->\n';

/** The built index.html as Vite writes it with `html.cspNonce` (S7-70). */
const SHELL_HTML = `<!doctype html><html><head>
<meta property="csp-nonce" nonce="${CSP_NONCE_PLACEHOLDER}">
<script type="module" crossorigin src="/assets/index-abcd1234.js" nonce="${CSP_NONCE_PLACEHOLDER}"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abcd1234.css" nonce="${CSP_NONCE_PLACEHOLDER}">
<link rel="icon" href="/icons/icon.svg">
</head><body><div id="root"></div></body></html>`;

const ADS_TXT_LINE = 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0';

/** Ads on for the stand-in's own host (`localhost`), with the sign-off the config requires. */
const ADS_CONFIG: ServerConfigInput = {
  ads: {
    enabled: true,
    client: 'ca-pub-1234567890123456',
    slots: { menu: '1111111111' },
    domains: ['localhost'],
    signOff: { by: 'Dyrekcja szkoły', date: '2026-10-01' },
    adsTxt: [ADS_TXT_LINE],
  },
};

type Upstream = { upstream?: WebSocket; queue: string[] };

type Stack = { baseUrl: string; stop(): Promise<void> };

/**
 * A game server and a stand-in front. `proxy` routes like the Caddyfile (static files itself,
 * every other path to the server); `static-fallback` answers every page with the static
 * index.html, as Caddy's handle_errors does while the server is down (the API still works).
 */
function startStack(config: ServerConfigInput, front: 'proxy' | 'static-fallback'): Stack {
  const game = startServer(
    { PORT: 0, DATABASE_PATH: ':memory:', DEV_LATENCY_MS: 0, BRIEFING_MS: 5000 },
    {
      config: staticConfigStore(config),
      shell: { indexHtml: SHELL_HTML, supportsNonce: true, privacyMarkdown: PRIVACY_MD },
    },
  );
  const backend = `localhost:${game.server.port}`;
  const forward = (url: URL) => fetch(`http://${backend}${url.pathname}${url.search}`);
  const server = Bun.serve<Upstream>({
    port: 0,
    async fetch(request, bunServer) {
      const url = new URL(request.url);
      if (url.pathname === '/ws') {
        return bunServer.upgrade(request, { data: { queue: [] } })
          ? undefined
          : new Response('upgrade failed', { status: 400 });
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
        return forward(url);
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
      if (url.pathname === '/manifest.webmanifest') {
        return new Response('{"name":"Redakcja"}', {
          headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' },
        });
      }
      if (front === 'static-fallback') {
        return new Response(HTML, {
          status: 502,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      return forward(url);
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
  return {
    baseUrl: `http://localhost:${server.port}`,
    async stop() {
      server.stop(true);
      await game.stop();
    },
  };
}

function byName(results: CheckResult[], name: string): CheckResult | undefined {
  return results.find((r) => r.name === name);
}

describe('smoke helpers', () => {
  it('maps the base URL to the WebSocket URL', () => {
    expect(websocketUrl(new URL('https://gra.example.pl'))).toBe('wss://gra.example.pl/ws');
    expect(websocketUrl(new URL('http://localhost:8080/'))).toBe('ws://localhost:8080/ws');
  });

  it('finds scripts and stylesheets but not external or icon links', () => {
    expect(linkedAssets(HTML)).toEqual(['/assets/index-abcd1234.js', '/assets/index-abcd1234.css']);
    expect(linkedAssets('<script src="https://cdn.example/x.js"></script>')).toEqual([]);
  });

  it('reads one CSP directive', () => {
    const csp = "default-src 'self'; script-src 'nonce-abc' 'strict-dynamic'; object-src 'none'";
    expect(cspDirective(csp, 'script-src')).toBe("'nonce-abc' 'strict-dynamic'");
    expect(cspDirective(csp, 'frame-src')).toBeUndefined();
  });

  it('reads the module script nonce', () => {
    expect(moduleScriptNonce('<script type="module" src="/a.js" nonce="Zm9v"></script>')).toBe(
      'Zm9v',
    );
    expect(moduleScriptNonce(HTML)).toBeNull();
  });

  it('reads the embedded public config, or says it is missing or invalid', () => {
    expect(embeddedConfig(HTML)).toEqual({ kind: 'missing' });
    expect(
      embeddedConfig('<script id="redakcja-config" type="application/json">{"x":1}</script>').kind,
    ).toBe('invalid');
    expect(
      embeddedConfig('<script id="redakcja-config" type="application/json">{</script>').kind,
    ).toBe('invalid');
  });
});

describe('smoke run, ads off (base CSP)', () => {
  let stack: Stack;
  beforeAll(() => {
    stack = startStack({}, 'proxy');
  });
  afterAll(() => stack.stop());

  it('passes the full flow through the front URL', async () => {
    const results = await runSmoke(stack.baseUrl, { snapshots: 5 });
    expect(results.filter((r) => r.status === 'fail')).toEqual([]);
    expect(results.map((r) => r.name)).toContain('start level and receive snapshots');
    // The stand-in sends no X-Content-Type-Options, so that is a warning, not a failure.
    expect(byName(results, 'GET / (HTML)')?.status).toBe('warn');
    expect(byName(results, 'GET /api/config')?.detail).toBe('ads off, revision 0');
    expect(byName(results, 'HTML shell: embedded config and CSP mode')?.detail).toBe(
      "base mode: script-src 'self'",
    );
    expect(byName(results, 'HTML shell nonce changes per request')?.detail).toBe('fresh nonce');
    expect(byName(results, 'GET /ads.txt')?.detail).toBe('not configured (404)');
    expect(byName(results, 'GET /prywatnosc')).toMatchObject({
      status: 'pass',
      detail: 'privacy page, ads section hidden',
    });
    expect(byName(results, 'GET /manifest.webmanifest')?.detail).toBe(
      'application/manifest+json, no-cache',
    );
  }, 30_000);

  it('fails strict mode when security headers are missing', async () => {
    const results = await runSmoke(stack.baseUrl, { strict: true, snapshots: 2 });
    expect(byName(results, 'GET / (HTML)')?.status).toBe('fail');
  }, 30_000);
});

describe('smoke run, ads on (nonce CSP)', () => {
  let stack: Stack;
  beforeAll(() => {
    stack = startStack(ADS_CONFIG, 'proxy');
  });
  afterAll(() => stack.stop());

  it('passes the strict-dynamic checks and sees a fresh nonce per request', async () => {
    const results = await runSmoke(stack.baseUrl, { snapshots: 2 });
    expect(results.filter((r) => r.status === 'fail')).toEqual([]);
    expect(byName(results, 'GET /api/config')?.detail).toBe('ads on, revision 0');
    expect(byName(results, 'HTML shell: embedded config and CSP mode')).toMatchObject({
      status: 'pass',
      detail: 'ads mode: nonce policy matches the page',
    });
    expect(byName(results, 'HTML shell nonce changes per request')?.detail).toBe('fresh nonce');
    expect(byName(results, 'GET /ads.txt')).toMatchObject({
      status: 'pass',
      detail: '1 line(s), text/plain',
    });
    expect(byName(results, 'GET /prywatnosc')).toMatchObject({
      status: 'pass',
      detail: 'privacy page, ads section shown',
    });
  }, 30_000);
});

describe('smoke run, game server pages missing (static fallback)', () => {
  let stack: Stack;
  beforeAll(() => {
    stack = startStack({}, 'static-fallback');
  });
  afterAll(() => stack.stop());

  it('warns about the static shell and fails when /ads.txt is HTML', async () => {
    const results = await runSmoke(stack.baseUrl, { snapshots: 1 });
    expect(byName(results, 'HTML shell: embedded config and CSP mode')).toMatchObject({
      status: 'warn',
      detail: 'HTML shell not rendered by the game server (static fallback?)',
    });
    expect(byName(results, 'GET /ads.txt')).toMatchObject({
      status: 'fail',
      detail: 'HTML instead of ads.txt: the SPA fallback swallowed /ads.txt',
    });
    expect(byName(results, 'GET /prywatnosc')).toMatchObject({
      status: 'fail',
      detail: 'HTTP 502, text/html; charset=utf-8',
    });
  }, 30_000);

  it('reports a failure, not a crash, when nothing listens', async () => {
    const results = await runSmoke('http://localhost:1', { snapshots: 1 });
    expect(results.some((r) => r.status === 'fail')).toBe(true);
    expect(results.find((r) => r.name.startsWith('WebSocket opens'))?.status).toBe('fail');
  }, 30_000);
});
