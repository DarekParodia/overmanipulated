// Content-Security-Policy and the other per-page headers of the HTML shell (S7-70). The single
// TypeScript source of both policies:
// - base: the strict same-origin policy, byte for byte the one in the Caddyfile (Caddy keeps it
//   for static files and its fallback page; tools/deploy/caddyfile.test.ts guards the parity);
// - ads: Google's strict nonce policy for AdSense, used only when ads run for the request host.
//   The nonce and 'strict-dynamic' go in script-src only: a nonce in style-src would switch off
//   its 'unsafe-inline', which React style attributes and the ad iframes' own styles need.
import type { ServerConfig } from '../config.ts';

export type CspMode = 'base' | 'ads';
/** Extra sources per fetch directive (`csp.extra` / `csp.adsExtra` in config.json). */
export type CspExtra = ServerConfig['csp']['extra'];

type Directive = readonly [name: string, sources: readonly string[]];

/** The base policy, in the Caddyfile's order. */
export const BASE_CSP_DIRECTIVES: readonly Directive[] = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  // 'unsafe-inline' for styles only: React inline style attributes.
  ['style-src', ["'self'", "'unsafe-inline'"]],
  // blob:/data: serve canvas textures and decoded audio.
  ['img-src', ["'self'", 'data:', 'blob:']],
  ['font-src', ["'self'"]],
  ['media-src', ["'self'", 'blob:', 'data:']],
  // wss: next to 'self' because older Safari does not match 'self' against ws(s) URLs.
  ['connect-src', ["'self'", 'wss:']],
  ['worker-src', ["'self'", 'blob:']],
  ['manifest-src', ["'self'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
];

/**
 * What ads mode replaces (or adds, at the end) on top of the base policy. Scripts follow Google's
 * strict CSP for AdSense: browsers with CSP3 trust only the nonce and what nonced scripts load
 * ('strict-dynamic'), and ignore 'unsafe-inline' and https:/http:, which are fallbacks for old
 * browsers only. The other fetch directives open https: as far as ad creatives, their iframes and
 * Google's consent message need. object-src and frame-ancestors stay closed.
 */
function adsOverrides(nonce: string): readonly Directive[] {
  return [
    [
      'script-src',
      [
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https:',
        'http:',
      ],
    ],
    ['style-src', ["'self'", "'unsafe-inline'", 'https:']],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:', 'https:']],
    ['connect-src', ["'self'", 'wss:', 'https:']],
    ['frame-src', ['https:']],
  ];
}

export type BuildCspOptions = {
  mode: CspMode;
  /** Required in ads mode (a policy naming no nonce would block our own scripts); unused in base. */
  nonce: string | null;
  /** Appended in both modes. */
  extra?: CspExtra;
  /** Appended in ads mode only. */
  adsExtra?: CspExtra;
};

/** The policy as one header value; a directive missing from the base set is added at the end. */
export function buildCsp(options: BuildCspOptions): string {
  const directives = new Map<string, string[]>(
    BASE_CSP_DIRECTIVES.map(([name, sources]) => [name, [...sources]]),
  );
  if (options.mode === 'ads') {
    if (options.nonce === null) {
      throw new Error('ads CSP needs a nonce');
    }
    for (const [name, sources] of adsOverrides(options.nonce)) {
      directives.set(name, [...sources]);
    }
  }
  const extras = options.mode === 'ads' ? [options.extra, options.adsExtra] : [options.extra];
  for (const extra of extras) {
    for (const [name, sources] of Object.entries(extra ?? {})) {
      const current = directives.get(name) ?? [];
      directives.set(name, [...current, ...sources.filter((s) => !current.includes(s))]);
    }
  }
  return [...directives].map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/** Referrer-Policy per mode: Google's consent message does not show under `no-referrer`. */
export function referrerPolicy(mode: CspMode): string {
  return mode === 'ads' ? 'strict-origin-when-cross-origin' : 'no-referrer';
}

/**
 * Headers the game server owns on every page it renders. `no-store` because the body carries a
 * per-request nonce (and the embedded config changes with reloads and MOTD windows).
 */
export function shellHeaders(mode: CspMode, csp: string): Record<string, string> {
  return {
    'Content-Security-Policy': csp,
    'Referrer-Policy': referrerPolicy(mode),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
}
