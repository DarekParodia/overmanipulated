// Pages the game server renders itself (S7-70), mounted last so every API route wins:
// - `/`, SPA paths and `/index.html`: the HTML shell with a per-request nonce, the embedded public
//   config and a CSP chosen from config.json and the request Host (ads mode only on ad hosts);
// - `/ads.txt`: the operator's `ads.adsTxt` lines, for every host and also while ads are off
//   (AdSense checks it before ads go live);
// - `/prywatnosc`: the privacy note (S7-75), with its ads text only where ads run for the host.
// Reserved prefixes and file-like paths never get HTML: an unknown API path or a missing
// `foo.js` must stay a 404 (a stale tab caching index.html as a script breaks for good).
import { hostAllowed, normalizeHost } from '@redakcja/shared';
import { type Context, Hono } from 'hono';
import type { ConfigMeta, ServerConfig } from '../config.ts';
import { ADS_TXT_MAX_AGE_S } from '../limits.ts';
import { toPublicConfig } from '../public-config.ts';
import { adsCspReady, type ShellAssets } from '../shell/assets.ts';
import { buildCsp, shellHeaders } from '../shell/csp.ts';
import { privacyFlags, privacyVars, renderPrivacyPage } from '../shell/privacy-page.ts';
import { createNonce, renderShell } from '../shell/render-shell.ts';

export type ShellDeps = {
  config: () => ServerConfig;
  configMeta: () => ConfigMeta;
  shell: ShellAssets;
  /** Clock for MOTD windows; tests pin it. */
  now?: () => number;
  /** Nonce source; tests pin it. */
  nonce?: () => string;
};

const API_PREFIX = '/api';
/** Paths that belong to the API, the socket, health checks or Caddy's static files. */
const RESERVED_PREFIXES = [API_PREFIX, '/ws', '/health', '/assets'];

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Whether `path` may be answered with the HTML shell. */
export function isShellPath(path: string): boolean {
  if (RESERVED_PREFIXES.some((prefix) => underPrefix(path, prefix))) {
    return false;
  }
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  return path === '/index.html' || !lastSegment.includes('.');
}

function notFound(c: Context) {
  // JSON for the API, so the typed client never parses an HTML or text error page.
  return underPrefix(c.req.path, API_PREFIX) ? c.json({ error: 'not found' }, 404) : c.notFound();
}

export function createShellRoutes(deps: ShellDeps) {
  const now = deps.now ?? Date.now;
  const nonce = deps.nonce ?? (() => createNonce());
  const { shell } = deps;
  /** The public config for this request: one ads decision for the shell and the privacy page. */
  const publicConfigFor = (c: Context, config: ServerConfig) =>
    toPublicConfig(config, {
      host: normalizeHost(c.req.header('host')),
      nowMs: now(),
      revision: deps.configMeta().revision,
      // Equals `supportsNonce` wherever the shell renders; without a build (dev) the page comes
      // from Vite, so the privacy page follows `/api/config` there.
      adsCspReady: adsCspReady(shell),
    });

  return new Hono()
    .get('/ads.txt', (c) => {
      const lines = deps.config().ads.adsTxt;
      if (lines.length === 0) {
        return c.notFound();
      }
      return c.text(`${lines.join('\n')}\n`, 200, {
        'Cache-Control': `public, max-age=${ADS_TXT_MAX_AGE_S}`,
      });
    })
    .get('/prywatnosc', (c) => {
      if (shell.privacyMarkdown === null) {
        return c.notFound();
      }
      const config = deps.config();
      const html = renderPrivacyPage(shell.privacyMarkdown, {
        vars: privacyVars(config),
        flags: privacyFlags(publicConfigFor(c, config).ads),
      });
      // The page never shows ads, so it always gets the base policy; no-cache (not no-store, as
      // there is no nonce) so a config reload shows on the next visit.
      const headers = shellHeaders(
        'base',
        buildCsp({ mode: 'base', nonce: null, extra: config.csp.extra }),
      );
      return c.html(html, 200, { ...headers, 'Cache-Control': 'no-cache' });
    })
    .get('*', (c) => {
      if (shell.indexHtml === null || !isShellPath(c.req.path)) {
        return notFound(c);
      }
      const config = deps.config();
      const host = normalizeHost(c.req.header('host'));
      const publicConfig = publicConfigFor(c, config);
      // One decision for the page: the embedded config and the CSP never disagree about ads.
      const mode = publicConfig.ads.enabled ? 'ads' : 'base';
      const { client, verification, domains } = config.ads;
      const wantsMeta = mode === 'ads' || (verification && hostAllowed(host, domains));
      const requestNonce = nonce();
      const html = renderShell(shell.indexHtml, {
        nonce: requestNonce,
        publicConfig,
        adsAccount: wantsMeta && client !== undefined ? client : null,
      });
      const csp = buildCsp({
        mode,
        nonce: requestNonce,
        extra: config.csp.extra,
        adsExtra: config.csp.adsExtra,
      });
      return c.html(html, 200, shellHeaders(mode, csp));
    });
}
