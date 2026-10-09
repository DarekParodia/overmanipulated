import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverTarget = process.env.GAME_SERVER ?? 'localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Dev only: forward the game socket and REST API to the Bun game server.
    proxy: {
      '/ws': { target: `ws://${serverTarget}`, ws: true },
      '/api': { target: `http://${serverTarget}` },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/ws': { target: `ws://${serverTarget}`, ws: true },
      '/api': { target: `http://${serverTarget}` },
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
