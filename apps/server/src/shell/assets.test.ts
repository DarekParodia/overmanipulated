import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSP_NONCE_PLACEHOLDER } from '@redakcja/shared';
import { adsCspReady, loadShellAssets, NO_SHELL, readOptionalFile } from './assets.ts';

const PAGE = `<html><head><script nonce="${CSP_NONCE_PLACEHOLDER}"></script></head><body><div id="root"></div></body></html>`;

function load(content: string | null) {
  return loadShellAssets({ indexPath: '/x/index.html' }, () => content);
}

describe('loadShellAssets', () => {
  it('loads a built page with the nonce placeholder', () => {
    expect(load(PAGE)).toEqual({ indexHtml: PAGE, supportsNonce: true });
  });

  it('a page without the placeholder loads but cannot carry ads', () => {
    const page = '<html><head></head><body><div id="root"></div></body></html>';
    const shell = load(page);
    expect(shell).toEqual({ indexHtml: page, supportsNonce: false });
    expect(adsCspReady(shell)).toBe(false);
  });

  it('no build or an unusable page turns the shell off', () => {
    expect(load(null)).toEqual(NO_SHELL);
    expect(load('<html><body>no head</body></html>')).toEqual(NO_SHELL);
    expect(load('<html><head></head><body></body></html>')).toEqual(NO_SHELL);
  });

  it('ads may run when there is no shell (dev) or the shell has the placeholder', () => {
    expect(adsCspReady(NO_SHELL)).toBe(true);
    expect(adsCspReady(load(PAGE))).toBe(true);
  });
});

describe('readOptionalFile', () => {
  it('reads a file, and gives null for a missing one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-assets-'));
    try {
      writeFileSync(join(dir, 'index.html'), PAGE);
      expect(readOptionalFile(join(dir, 'index.html'))).toBe(PAGE);
      expect(readOptionalFile(join(dir, 'missing.html'))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
