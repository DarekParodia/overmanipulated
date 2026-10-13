// Guards the Caddyfile against drifting from the game server: the strict CSP Caddy sends on
// static files and its fallback page must be the base policy the HTML shell renders
// (apps/server/src/shell/csp.ts), and the client-address chain (S7-02) must stay intact.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCsp, referrerPolicy } from '../../apps/server/src/shell/csp.ts';

const CADDYFILE = readFileSync(fileURLToPath(new URL('../../Caddyfile', import.meta.url)), 'utf8');

/** Lines without comments and blank lines, trimmed. */
const LINES = CADDYFILE.split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

/**
 * Bodies of every block whose opening line is `opener … {`, matched brace by brace. Throws when
 * an `opener` line opens no block, so a one-line directive can never borrow the next block.
 */
function blocks(opener: string): string[] {
  const found: string[] = [];
  const escaped = opener.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const match of CADDYFILE.matchAll(new RegExp(`^[ \\t]*${escaped}\\b.*$`, 'gm'))) {
    const line = match[0];
    if (!line.trimEnd().endsWith('{')) {
      throw new Error(`"${line.trim()}" opens no block`);
    }
    const open = (match.index ?? 0) + line.lastIndexOf('{');
    let depth = 0;
    let end = open;
    for (; end < CADDYFILE.length; end += 1) {
      if (CADDYFILE[end] === '{') depth += 1;
      if (CADDYFILE[end] === '}') depth -= 1;
      if (depth === 0) break;
    }
    found.push(CADDYFILE.slice(open + 1, end));
  }
  return found;
}

/** Value of a quoted header in a `header` block, set (`Name`) or as a default (`?Name`). */
function headerValue(name: string): string | undefined {
  return new RegExp(`^\\s*\\??${name} "([^"]*)"`, 'm').exec(CADDYFILE)?.[1];
}

describe('Caddyfile', () => {
  it("the Content-Security-Policy is the HTML shell's base policy, byte for byte", () => {
    expect(headerValue('Content-Security-Policy')).toBe(buildCsp({ mode: 'base', nonce: null }));
  });

  it("the Referrer-Policy is the shell's base-mode policy", () => {
    expect(headerValue('Referrer-Policy')).toBe(referrerPolicy('base'));
  });

  it('the global servers block comes first and trusts only the TLS proxy', () => {
    expect(LINES[0]).toBe('{');
    expect(LINES[1]).toBe('servers {');
    const [servers] = blocks('servers');
    expect(servers).toContain('trusted_proxies static {$TRUSTED_PROXIES:private_ranges}');
    expect(servers).toContain('trusted_proxies_strict');
    expect(servers).toContain('client_ip_headers X-Forwarded-For');
  });

  it('every proxy to the game server sends header_up X-Real-IP {client_ip}', () => {
    const proxies = blocks('reverse_proxy server:3000');
    expect(proxies.length).toBeGreaterThan(0);
    for (const body of proxies) {
      expect(body).toContain('header_up X-Real-IP {client_ip}');
    }
  });

  it('the backend matcher is unchanged', () => {
    expect(LINES).toContain('@backend path /ws /api /api/* /health');
  });

  // S7-71: the game server renders the pages, so its CSP and Referrer-Policy must win there.
  it('CSP, Referrer-Policy and COOP are defaults only', () => {
    const [headers] = blocks('(security_headers'); // `\b` cannot follow ')'
    for (const name of [
      'Content-Security-Policy',
      'Referrer-Policy',
      'Cross-Origin-Opener-Policy',
    ]) {
      expect(headers).toMatch(new RegExp(`^\\s*\\?${name} "`, 'm'));
      expect(headers).not.toMatch(new RegExp(`^\\s*${name} "`, 'm'));
    }
    expect(headers).toContain('X-Content-Type-Options "nosniff"');
  });

  it('static files never include the HTML shell, and the catch-all goes to the game server', () => {
    const [staticMatcher] = blocks('@static');
    expect(staticMatcher).toContain('not path / /index.html');
    expect(staticMatcher).toContain('file');
    expect(LINES).not.toContain('try_files {path} /index.html');
    // Two handles proxy to the game server: @backend and the catch-all `handle {`.
    const proxied = blocks('handle').filter((body) => body.includes('import game_server'));
    expect(proxied).toHaveLength(2);
    expect(LINES).toContain('handle {');
  });

  it('a 502/503/504 serves the static index.html, never for /ads.txt or the API', () => {
    const [errors] = blocks('handle_errors 502 503 504');
    expect(errors).toContain('import security_headers');
    expect(errors).toContain('@page not path /ads.txt /api /api/* /ws /health');
    expect(errors).toContain('rewrite * /index.html');
    expect(errors).toContain('file_server');
  });
});
