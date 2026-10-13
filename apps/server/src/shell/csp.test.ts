import { describe, expect, it } from 'bun:test';
import { buildCsp, referrerPolicy, shellHeaders } from './csp.ts';

/** Caddyfile `Content-Security-Policy` value (the strict same-origin policy). */
const CADDY_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function directive(csp: string, name: string): string | undefined {
  return csp
    .split('; ')
    .find((d) => d === name || d.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

describe('buildCsp', () => {
  it('base mode is byte-identical to the Caddyfile policy, with or without a nonce', () => {
    expect(buildCsp({ mode: 'base', nonce: null })).toBe(CADDY_CSP);
    expect(buildCsp({ mode: 'base', nonce: 'x' })).toBe(CADDY_CSP);
  });

  it("ads mode puts the nonce and 'strict-dynamic' in script-src only", () => {
    const csp = buildCsp({ mode: 'ads', nonce: 'abc' });
    expect(directive(csp, 'script-src')).toBe(
      "'nonce-abc' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http:",
    );
    expect(directive(csp, 'style-src')).toBe("'self' 'unsafe-inline' https:");
    expect(csp.match(/'nonce-/g)?.length).toBe(1);
    expect(csp.match(/'strict-dynamic'/g)?.length).toBe(1);
  });

  it('ads mode opens https: for ad creatives and keeps the closed directives closed', () => {
    const csp = buildCsp({ mode: 'ads', nonce: 'abc' });
    expect(directive(csp, 'img-src')).toBe("'self' data: blob: https:");
    expect(directive(csp, 'font-src')).toBe("'self' data: https:");
    expect(directive(csp, 'connect-src')).toBe("'self' wss: https:");
    expect(directive(csp, 'frame-src')).toBe('https:');
    expect(directive(csp, 'default-src')).toBe("'self'");
    expect(directive(csp, 'object-src')).toBe("'none'");
    expect(directive(csp, 'frame-ancestors')).toBe("'none'");
    expect(directive(csp, 'base-uri')).toBe("'self'");
    expect(csp.endsWith('; frame-src https:')).toBe(true);
  });

  it('ads mode without a nonce is refused', () => {
    expect(() => buildCsp({ mode: 'ads', nonce: null })).toThrow('nonce');
  });

  it('csp.extra applies in both modes, csp.adsExtra only in ads mode', () => {
    const extra = { 'img-src': ['https://example.org'] };
    const adsExtra = { 'frame-src': ['https://ads.example.org'] };
    const base = buildCsp({ mode: 'base', nonce: null, extra, adsExtra });
    const ads = buildCsp({ mode: 'ads', nonce: 'abc', extra, adsExtra });
    expect(directive(base, 'img-src')).toBe("'self' data: blob: https://example.org");
    expect(directive(base, 'frame-src')).toBeUndefined();
    expect(directive(ads, 'img-src')).toBe("'self' data: blob: https: https://example.org");
    expect(directive(ads, 'frame-src')).toBe('https: https://ads.example.org');
  });

  it('an extra directive missing from the base set is added at the end, without duplicates', () => {
    const csp = buildCsp({
      mode: 'base',
      nonce: null,
      extra: { 'frame-src': ['https://video.example.org'], 'connect-src': ['wss:'] },
    });
    expect(csp).toBe(`${CADDY_CSP}; frame-src https://video.example.org`);
  });
});

describe('shellHeaders', () => {
  it('Referrer-Policy is strict-origin-when-cross-origin in ads mode and no-referrer otherwise', () => {
    expect(referrerPolicy('ads')).toBe('strict-origin-when-cross-origin');
    expect(referrerPolicy('base')).toBe('no-referrer');
    expect(shellHeaders('ads', 'x')['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('carries the policy, COOP and no-store', () => {
    expect(shellHeaders('base', CADDY_CSP)).toEqual({
      'Content-Security-Policy': CADDY_CSP,
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    });
  });
});
