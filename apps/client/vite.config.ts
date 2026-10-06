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
    chunkSizeWarningLimit: 1500,
  },
});
