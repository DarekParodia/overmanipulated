import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev-only: forward WebSocket traffic to the Bun game server.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
