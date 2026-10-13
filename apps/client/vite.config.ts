import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// Direct path, not the package: vite.config must not load zod or the rest of @redakcja/shared.
import { CSP_NONCE_PLACEHOLDER } from '../../packages/shared/src/csp-nonce.ts';

const serverTarget = process.env.GAME_SERVER ?? 'localhost:3000';

export default defineConfig({
  plugins: [react()],
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
