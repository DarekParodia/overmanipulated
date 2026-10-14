import { describe, expect, it } from 'bun:test';
import { CSP_NONCE_PLACEHOLDER, type PublicConfig, publicConfigSchema } from '@redakcja/shared';
import { createFakeHub } from '../__fixtures__/fake-transport.ts';
import { createApp } from '../app.ts';
import { parseConfigValue, type ServerConfig } from '../config.ts';
import { openDatabase } from '../db/client.ts';
import { createRoomRegistry } from '../rooms/registry.ts';
import type { ShellAssets } from '../shell/assets.ts';
import { isShellPath } from './shell.ts';

const P = CSP_NONCE_PLACEHOLDER;
/** What `vite build` writes with `html.cspNonce` (trimmed). */
const TEMPLATE = `<!doctype html>
<html lang="pl">
  <head>
    <title>Redakcja na Ostatnią Chwilę</title>
    <meta property="csp-nonce" nonce="${P}">
    <script type="module" crossorigin src="/assets/index-H0FvZbs7.js" nonce="${P}"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-nckxGGqo.css" nonce="${P}">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

/** A privacy note with every block the real one uses (docs/privacy.pl.md). */
const PRIVACY_MD = `[← Wróć do gry](/)

# Prywatność

Administrator: **{{operator.name|[do uzupełnienia]}}**, {{operator.contact|brak kontaktu}}.

<!-- ads -->
## Reklamy
<!-- ads-limited -->
Reklamy ograniczone, bez ciasteczek.
<!-- /ads-limited -->
<!-- ads-cookies -->
Reklamy mogą używać ciasteczek.
<!-- /ads-cookies -->
<!-- /ads -->
<!-- no-ads -->
Na tej stronie nie ma reklam.
<!-- /no-ads -->
`;

const SHELL: ShellAssets = {
  indexHtml: TEMPLATE,
  supportsNonce: true,
  privacyMarkdown: PRIVACY_MD,
};

const ADS_HOST = 'bronsie.drkp.dev';
const ADS_ON = {
  enabled: true,
  client: 'ca-pub-1234567890123456',
  slots: { menu: '1111111111' },
  domains: [ADS_HOST],
  signOff: { by: 'Anna Nowak, opiekunka projektu', date: '2026-10-01' },
};
const ADS_TXT_LINE = 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0';

/** Caddyfile `Content-Security-Policy` value (the strict same-origin policy). */
const BASE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function config(input: Record<string, unknown>): ServerConfig {
  const parsed = parseConfigValue(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.config;
}

/** `shell: null` builds the app without a client build (no `shell` dep at all). */
function setup(input: Record<string, unknown> = {}, shell: ShellAssets | null = SHELL) {
  let current = config(input);
  const db = openDatabase(':memory:');
  const registry = createRoomRegistry({ hub: createFakeHub().hub });
  const app = createApp({
    db,
    registry,
    devLatencyMs: 0,
    config: () => current,
    configMeta: () => ({ source: 'file', revision: 2 }),
    ...(shell === null ? {} : { shell }),
  });
  return {
    app,
    get: (path: string, host = 'localhost:3000') => app.request(path, { headers: { host } }),
    swap(next: Record<string, unknown>) {
      current = config(next);
    },
  };
}

function directive(csp: string | null, name: string): string | undefined {
  return csp
    ?.split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

function embedded(html: string): PublicConfig {
  const match = /<script id="redakcja-config" type="application\/json">(.*?)<\/script>/s.exec(html);
  if (!match?.[1]) throw new Error('no embedded config');
  return publicConfigSchema.parse(JSON.parse(match[1]));
}

function bodyNonces(html: string): string[] {
  return [...html.matchAll(/nonce="([^"]*)"/g)].map((m) => m[1] ?? '');
}

describe('HTML shell', () => {
  it('the ads host gets strict-dynamic with a nonce that matches the body and rotates', async () => {
    const { get } = setup({ ads: ADS_ON });
    const first = await get('/', ADS_HOST);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toContain('text/html');
    expect(first.headers.get('cache-control')).toBe('no-store');
    const csp = first.headers.get('content-security-policy');
    const scriptSrc = directive(csp, 'script-src');
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc ?? '')?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(scriptSrc).toBe(
      `'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http:`,
    );
    // style-src keeps 'unsafe-inline' working: no nonce there.
    expect(directive(csp, 'style-src')).toBe("'self' 'unsafe-inline' https:");
    const html = await first.text();
    expect(html).not.toContain(P);
    expect(bodyNonces(html)).toEqual([nonce, nonce, nonce].map(String));
    expect(html).toContain(
      '<meta name="google-adsense-account" content="ca-pub-1234567890123456">',
    );
    expect(embedded(html).ads).toMatchObject({ enabled: true, client: 'ca-pub-1234567890123456' });

    const second = await get('/', ADS_HOST);
    const nonce2 = /'nonce-([^']+)'/.exec(second.headers.get('content-security-policy') ?? '')?.[1];
    expect(nonce2).toBeDefined();
    expect(nonce2).not.toBe(nonce);
    expect(bodyNonces(await second.text())[0]).toBe(String(nonce2));
  });

  it('other hosts get the base CSP, no-referrer and no meta tag', async () => {
    const { get } = setup({ ads: ADS_ON });
    const res = await get('/', 'localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(BASE_CSP);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    const html = await res.text();
    expect(html).not.toContain('google-adsense-account');
    expect(embedded(html).ads).toEqual({ enabled: false });
  });

  it('the Referrer-Policy differs per mode', async () => {
    const { get } = setup({ ads: ADS_ON });
    expect((await get('/', ADS_HOST)).headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect((await get('/', 'drkp.dev')).headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('verification without ads serves the meta tag on ad hosts under the base CSP', async () => {
    const { get } = setup({
      ads: { verification: true, client: 'ca-pub-1234567890123456', domains: [ADS_HOST] },
    });
    const res = await get('/', `${ADS_HOST}:443`);
    expect(res.headers.get('content-security-policy')).toBe(BASE_CSP);
    expect(await res.text()).toContain('content="ca-pub-1234567890123456"');
    expect(await (await get('/', 'localhost')).text()).not.toContain('google-adsense-account');
  });

  it('a MOTD containing </script> does not break the page', async () => {
    const text = 'Przerwa </script><script>alert(1)</script> o 12:00';
    const { get } = setup({ motd: { id: 'przerwa', text } });
    const html = await (await get('/')).text();
    expect(html).not.toContain('</script><script>');
    expect(embedded(html).motd).toEqual({ id: 'przerwa', text, tone: 'info' });
    // The page still ends as the template does: the element was not closed early.
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html.match(/<\/script>/g)?.length).toBe(2);
  });

  it('embeds the revision and the host-specific public config', async () => {
    const { get } = setup({ features: { roomBrowser: true } });
    const config = embedded(await (await get('/')).text());
    expect(config.revision).toBe(2);
    expect(config.features.roomBrowser).toBe(true);
  });

  it('a shell built without the nonce placeholder never turns on ads', async () => {
    const page = TEMPLATE.replaceAll(` nonce="${P}"`, '');
    const { app, get } = setup(
      { ads: ADS_ON },
      { indexHtml: page, supportsNonce: false, privacyMarkdown: PRIVACY_MD },
    );
    const res = await get('/', ADS_HOST);
    expect(res.headers.get('content-security-policy')).toBe(BASE_CSP);
    expect(embedded(await res.text()).ads).toEqual({ enabled: false });
    const api = await app.request('/api/config', { headers: { host: ADS_HOST } });
    expect(publicConfigSchema.parse(await api.json()).ads).toEqual({ enabled: false });
  });

  it('turning ads off with a reload applies to the next page', async () => {
    const { get, swap } = setup({ ads: ADS_ON });
    expect(
      directive((await get('/', ADS_HOST)).headers.get('content-security-policy'), 'script-src'),
    ).toContain("'strict-dynamic'");
    swap({ ads: { ...ADS_ON, enabled: false } });
    expect((await get('/', ADS_HOST)).headers.get('content-security-policy')).toBe(BASE_CSP);
  });

  it('csp.extra shows in the page policy', async () => {
    const { get } = setup({ csp: { extra: { 'img-src': ['https://img.example.org'] } } });
    const csp = (await get('/')).headers.get('content-security-policy');
    expect(directive(csp, 'img-src')).toBe("'self' data: blob: https://img.example.org");
  });

  it('SPA paths and /index.html render the shell', async () => {
    const { get } = setup();
    for (const path of ['/', '/index.html', '/lobby', '/pokoj/ABCD']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    }
    const head = await setup().app.request('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
  });

  it('extension paths, reserved paths and other methods are 404 and never HTML', async () => {
    const { app, get } = setup();
    for (const path of [
      '/missing.js',
      '/assets/index-XXXXXXXX.js',
      '/icons/nope.png',
      '/ws/x',
      '/health/x',
    ]) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type') ?? '').not.toContain('text/html');
    }
    const post = await app.request('/', { method: 'POST' });
    expect(post.status).toBe(404);
  });

  it('/api/unknown is a JSON 404, not HTML', async () => {
    const { get } = setup();
    const res = await get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'not found' });
    expect((await get('/api')).status).toBe(404);
  });

  it('API routes and health still win over the catch-all', async () => {
    const { get } = setup();
    expect((await get('/api/config')).headers.get('content-type')).toContain('application/json');
    expect((await get('/health')).headers.get('content-type')).toContain('application/json');
  });

  it('without a client build every shell path is 404', async () => {
    const { get } = setup({}, null);
    expect((await get('/')).status).toBe(404);
    expect((await get('/lobby')).status).toBe(404);
  });
});

describe('/ads.txt', () => {
  it('serves the configured lines as text/plain on every host, also with ads off', async () => {
    const { get } = setup({ ads: { adsTxt: [ADS_TXT_LINE] } });
    for (const host of [ADS_HOST, 'localhost']) {
      const res = await get('/ads.txt', host);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
      expect(res.headers.get('cache-control')).toBe('public, max-age=300');
      expect(await res.text()).toBe(`${ADS_TXT_LINE}\n`);
    }
  });

  it('is 404 (never the SPA page) when no lines are configured, with or without a shell', async () => {
    for (const shell of [SHELL, null]) {
      const res = await setup({}, shell).get('/ads.txt');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type') ?? '').not.toContain('text/html');
    }
  });
});

describe('/prywatnosc', () => {
  const OPERATOR = { name: 'XIV LO w Nowych Brzegach' };

  it('renders the note with operator values, the base CSP and no-cache', async () => {
    const { get } = setup({ site: { operator: OPERATOR } });
    const res = await get('/prywatnosc');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-security-policy')).toBe(BASE_CSP);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const html = await res.text();
    expect(html).toContain('<title>Prywatność</title>');
    expect(html).toContain('<h1>Prywatność</h1>');
    expect(html).toContain('<a href="/">← Wróć do gry</a>');
    // A set value replaces its fallback; an unset one shows the fallback from the note.
    expect(html).toContain('<strong>XIV LO w Nowych Brzegach</strong>, brak kontaktu.');
    expect(html).not.toContain('<script');
  });

  it('shows the ads section only where ads run for the host', async () => {
    const { get } = setup({ site: { operator: OPERATOR }, ads: ADS_ON });
    const onAdsHost = await (await get('/prywatnosc', ADS_HOST)).text();
    expect(onAdsHost).toContain('<div data-block="ads"><h2>Reklamy</h2>');
    expect(onAdsHost).toContain(
      '<div data-block="ads-limited"><p>Reklamy ograniczone, bez ciasteczek.</p></div>',
    );
    expect(onAdsHost).not.toContain('ads-cookies');
    expect(onAdsHost).not.toContain('nie ma reklam');

    const elsewhere = await (await get('/prywatnosc', 'localhost')).text();
    expect(elsewhere).not.toContain('Reklamy');
    expect(elsewhere).toContain(
      '<div data-block="no-ads"><p>Na tej stronie nie ma reklam.</p></div>',
    );
    // The page itself never runs ads, whatever the host.
    const res = await get('/prywatnosc', ADS_HOST);
    expect(res.headers.get('content-security-policy')).toBe(BASE_CSP);
  });

  it('non-personalised ads for adults show the cookies text instead', async () => {
    const { get } = setup({
      ads: { ...ADS_ON, mode: 'nonPersonalized', ageTreatment: 'unspecified' },
    });
    const html = await (await get('/prywatnosc', ADS_HOST)).text();
    expect(html).toContain(
      '<div data-block="ads-cookies"><p>Reklamy mogą używać ciasteczek.</p></div>',
    );
    expect(html).not.toContain('ads-limited');
  });

  it('turning ads off with a reload drops the ads section on the next visit', async () => {
    const { get, swap } = setup({ ads: ADS_ON });
    expect(await (await get('/prywatnosc', ADS_HOST)).text()).toContain('data-block="ads"');
    swap({ ads: { ...ADS_ON, enabled: false } });
    const html = await (await get('/prywatnosc', ADS_HOST)).text();
    expect(html).not.toContain('data-block="ads"');
    expect(html).toContain('data-block="no-ads"');
  });

  it('escapes markup in operator values', async () => {
    const { get } = setup({ site: { operator: { name: '<script>alert(1)</script>' } } });
    const html = await (await get('/prywatnosc')).text();
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script');
  });

  it('works without a client build, and is 404 without the note', async () => {
    const devShell: ShellAssets = {
      indexHtml: null,
      supportsNonce: false,
      privacyMarkdown: PRIVACY_MD,
    };
    const dev = setup({}, devShell);
    expect((await dev.get('/prywatnosc')).status).toBe(200);
    expect((await dev.get('/')).status).toBe(404);
    for (const shell of [{ ...SHELL, privacyMarkdown: null }, null]) {
      const res = await setup({}, shell).get('/prywatnosc');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type') ?? '').not.toContain('text/html');
    }
  });
});

describe('isShellPath', () => {
  it('accepts SPA paths and /index.html, refuses reserved and file-like paths', () => {
    expect(isShellPath('/')).toBe(true);
    expect(isShellPath('/index.html')).toBe(true);
    expect(isShellPath('/lobby')).toBe(true);
    expect(isShellPath('/apis')).toBe(true);
    expect(isShellPath('/api')).toBe(false);
    expect(isShellPath('/api/config')).toBe(false);
    expect(isShellPath('/ws')).toBe(false);
    expect(isShellPath('/health')).toBe(false);
    expect(isShellPath('/assets/x')).toBe(false);
    expect(isShellPath('/manifest.webmanifest')).toBe(false);
    expect(isShellPath('/a.b/c')).toBe(true);
  });
});
