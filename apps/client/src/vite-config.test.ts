// The HTML shell (S7-70) swaps CSP_NONCE_PLACEHOLDER for a per-request nonce; without it in the
// build every nonce attribute is missing and ads stay off for good (`supportsNonce`).
import { describe, expect, it } from 'bun:test';
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
});
