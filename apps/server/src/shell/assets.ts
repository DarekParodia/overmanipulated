// Files the HTML shell is rendered from (S7-70), read once at startup: the built client
// `index.html` (the Docker server stage copies it from the same client build Caddy serves). With
// no build (dev, most tests) the shell is off and those paths 404, as before; Vite serves the page.
import { readFileSync } from 'node:fs';
import { CSP_NONCE_PLACEHOLDER } from '@redakcja/shared';
import { log } from '../log.ts';

export type ShellAssets = {
  /** The built `index.html`; null when there is none or it is not a usable page. */
  indexHtml: string | null;
  /**
   * Whether the page carries Vite's nonce placeholder. Without it a nonce-only script-src would
   * block our own scripts, so ads stay off (`adsCspReady`).
   */
  supportsNonce: boolean;
};

/** No HTML shell: every shell path 404s. */
export const NO_SHELL: ShellAssets = Object.freeze({ indexHtml: null, supportsNonce: false });

/** Whether ads may run in pages this server renders (ApiDeps.adsCspReady). */
export function adsCspReady(shell: ShellAssets): boolean {
  // No shell: the page comes from elsewhere (Vite dev or preview) and carries no CSP of ours.
  return shell.indexHtml === null || shell.supportsNonce;
}

/** Reads a file; null when it does not exist. */
export function readOptionalFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function loadShellAssets(
  paths: { indexPath: string },
  read: (path: string) => string | null = readOptionalFile,
): ShellAssets {
  const html = read(paths.indexPath);
  if (html === null) {
    log.info('no client build found; HTML shell disabled', { path: paths.indexPath });
    return NO_SHELL;
  }
  if (!html.includes('</head>') || !html.includes('id="root"')) {
    log.warn('client index.html is not a usable page; HTML shell disabled', {
      path: paths.indexPath,
    });
    return NO_SHELL;
  }
  const supportsNonce = html.includes(CSP_NONCE_PLACEHOLDER);
  if (!supportsNonce) {
    log.warn('client index.html has no CSP nonce placeholder; ads stay off', {
      path: paths.indexPath,
    });
  }
  log.info('HTML shell loaded', { path: paths.indexPath, supportsNonce });
  return { indexHtml: html, supportsNonce };
}
