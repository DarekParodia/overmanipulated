// The HTML shell (S7-70) swaps CSP_NONCE_PLACEHOLDER for a per-request nonce; without it in the
// build every nonce attribute is missing and ads stay off for good (`supportsNonce`).
import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { CSP_NONCE_PLACEHOLDER } from '@redakcja/shared';
import viteConfig from '../vite.config.ts';

describe('vite.config', () => {
  it('writes the CSP nonce placeholder into the built index.html', () => {
    expect(viteConfig.html?.cspNonce).toBe(CSP_NONCE_PLACEHOLDER);
  });

  it('proxies the server-rendered text paths in dev and preview', () => {
    for (const proxy of [viteConfig.server?.proxy, viteConfig.preview?.proxy]) {
      expect(Object.keys(proxy ?? {})).toEqual(
        expect.arrayContaining(['/ws', '/api', '/ads.txt', '/prywatnosc']),
      );
    }
  });

  it('defines the version, copyright and authors for „O grze” (S7-103)', () => {
    const define = viteConfig.define ?? {};
    expect(JSON.parse(String(define.__APP_VERSION__))).toMatch(/^0\.0\.0\+(?:[0-9a-f]{7,12}|dev)$/);
    expect(JSON.parse(String(define.__APP_COPYRIGHT__))).toBe(
      'Copyright © 2026 Kamil Wida. Wszelkie prawa zastrzeżone.',
    );
    expect(JSON.parse(String(define.__APP_AUTHORS__))).toEqual(['Kamil Wida']);
  });

  it('says whether the build ships the intro voice sprite (S7-101)', () => {
    const shipped = existsSync(new URL('../public/assets/voice/intro.json', import.meta.url));
    expect(JSON.parse(String(viteConfig.define?.__INTRO_VOICE__))).toBe(shipped);
  });
});
