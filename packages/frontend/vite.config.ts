import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // host: true (0.0.0.0) so the dev server is reachable when run inside a
    // container (the frontend-dev compose service); harmless on the host.
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        // Defaults to the host-run backend; the dev container overrides this
        // to the compose service name via API_PROXY_TARGET=http://backend:3000.
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
