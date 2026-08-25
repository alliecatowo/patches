import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { HARNESS_HTTP_ORIGIN } from './safety.js';

const upstream = process.env['PATCHES_DEV_UPSTREAM'];
if (upstream !== HARNESS_HTTP_ORIGIN) {
  throw new Error('E2E Vite proxy requires the attested harness HTTP origin.');
}

/** Closed Vite configuration for the mutating browser smoke; never reads repo .env files. */
export default defineConfig({
  envDir: false,
  plugins: [react()],
  define: {
    __PATCHES_WEB_VERSION__: JSON.stringify('0.1.0+e2e'),
    __PATCHES_WEB_BUILT_AT__: JSON.stringify(new Date(0).toISOString()),
  },
  server: {
    proxy: {
      '/api': {
        target: upstream,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
