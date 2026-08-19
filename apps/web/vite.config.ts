import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev-only proxy so the browser can talk to the live Patches node without CORS
// being configured for a web origin yet (WEB_ORIGINS server env, not set for
// this client). `VITE_PATCHES_API_BASE` overrides the base URL the app itself
// requests against (defaults to `/api`, the proxied path) — see `src/api/client.ts`.
const PATCHES_UPSTREAM =
  process.env['PATCHES_DEV_UPSTREAM'] ?? 'https://patches-social.fly.dev:8443';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: PATCHES_UPSTREAM,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
