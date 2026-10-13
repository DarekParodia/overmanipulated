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
});
