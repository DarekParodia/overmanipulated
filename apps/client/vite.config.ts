import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// Direct path, not the package: vite.config must not load zod or the rest of @redakcja/shared.
import { CSP_NONCE_PLACEHOLDER } from '../../packages/shared/src/csp-nonce.ts';
import { appVersion, authorsFrom, copyrightLine, shortSha } from './src/about/build-info.ts';

const serverTarget = process.env.GAME_SERVER ?? 'localhost:3000';

/** `git rev-parse --short HEAD`, or null outside a checkout (the Docker build has no .git). */
function gitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch {
    return null;
  }
}

// „O grze” (S7-103): version, copyright and authors come from the package and the repository's
// LICENSE at build time. APP_GIT_SHA wins over git (the Docker build passes it as a build arg).
const packageJson: { version: string } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);
const copyright = copyrightLine(readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8'));
if (copyright === null) {
  throw new Error('LICENSE has no "Copyright" line for „O grze”');
}
export const APP_DEFINES = {
  __APP_VERSION__: JSON.stringify(
    appVersion(packageJson.version, shortSha(process.env.APP_GIT_SHA || gitSha())),
  ),
  __APP_COPYRIGHT__: JSON.stringify(copyright),
  __APP_AUTHORS__: JSON.stringify(authorsFrom(copyright)),
  // The intro voice is optional (S7-100): without its sprite the build never asks for it, so a
  // missing recording costs no request and no 404 in the console (S7-101).
  __INTRO_VOICE__: JSON.stringify(
    existsSync(new URL('./public/assets/voice/intro.json', import.meta.url)),
  ),
};

export default defineConfig({
  plugins: [react()],
  define: APP_DEFINES,
  // Every <script> and <link> Vite writes into index.html gets nonce="<placeholder>" (plus a
  // <meta property="csp-nonce"> its preload helper copies onto lazy chunks). The game server's
  // HTML shell swaps in a fresh nonce per request (S7-70); vite dev and preview send no CSP, so
  // the literal placeholder is harmless there.
  html: { cspNonce: CSP_NONCE_PLACEHOLDER },
  server: {
    port: 5173,
    host: true,
    // Dev only: forward the game socket and REST API to the Bun game server.
    proxy: {
      '/ws': { target: `ws://${serverTarget}`, ws: true },
      '/api': { target: `http://${serverTarget}` },
      // Served by the game server in production (S7-70, S7-75): same paths in dev and preview.
      '/ads.txt': { target: `http://${serverTarget}` },
      '/prywatnosc': { target: `http://${serverTarget}` },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/ws': { target: `ws://${serverTarget}`, ws: true },
      '/api': { target: `http://${serverTarget}` },
      // Served by the game server in production (S7-70, S7-75): same paths in dev and preview.
      '/ads.txt': { target: `http://${serverTarget}` },
      '/prywatnosc': { target: `http://${serverTarget}` },
    },
  },
  build: {
    target: 'es2022',
    // The manifest lets tools/perf/check-bundle.ts follow the real import graph of each route.
    manifest: true,
    // The game chunk (three.js + scene) is big on purpose and only loads when a match starts;
    // tools/perf/check-bundle.ts enforces the real first-load budget in gzip bytes. Manual vendor
    // chunks were tried and made the menu import three.js, so rolldown's default split stays.
    chunkSizeWarningLimit: 1500,
  },
});
