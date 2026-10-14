import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSP_NONCE_PLACEHOLDER } from '@redakcja/shared';
import { adsCspReady, loadShellAssets, NO_SHELL, readOptionalFile } from './assets.ts';

const PAGE = `<html><head><script nonce="${CSP_NONCE_PLACEHOLDER}"></script></head><body><div id="root"></div></body></html>`;

const NOTE = '# Prywatność\n\nTekst.';

function load(content: string | null, note: string | null = NOTE) {
  return loadShellAssets({ indexPath: '/x/index.html', privacyPath: '/x/privacy.pl.md' }, (path) =>
    path.endsWith('.md') ? note : content,
  );
}

describe('loadShellAssets', () => {
  it('loads a built page with the nonce placeholder', () => {
    expect(load(PAGE)).toEqual({ indexHtml: PAGE, supportsNonce: true, privacyMarkdown: NOTE });
  });

  it('a page without the placeholder loads but cannot carry ads', () => {
    const page = '<html><head></head><body><div id="root"></div></body></html>';
    const shell = load(page);
    expect(shell).toEqual({ indexHtml: page, supportsNonce: false, privacyMarkdown: NOTE });
    expect(adsCspReady(shell)).toBe(false);
  });

  it('no build or an unusable page turns the shell off but keeps the privacy note', () => {
    const noShell = { ...NO_SHELL, privacyMarkdown: NOTE };
    expect(load(null)).toEqual(noShell);
    expect(load('<html><body>no head</body></html>')).toEqual(noShell);
    expect(load('<html><head></head><body></body></html>')).toEqual(noShell);
  });

  it('a missing privacy note leaves the shell on and /prywatnosc off', () => {
    expect(load(PAGE, null)).toEqual({
      indexHtml: PAGE,
      supportsNonce: true,
      privacyMarkdown: null,
    });
    expect(load(null, null)).toEqual(NO_SHELL);
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
