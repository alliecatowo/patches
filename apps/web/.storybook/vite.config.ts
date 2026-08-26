import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The Storybook-only Vite config (wired in via `viteConfigPath` in main.ts). It reuses
 * only `react()` from the app's toolchain and swaps `src/api/client.ts` for the
 * deterministic mock in `.storybook/mocks/apiClient.ts`, so no story can ever reach the
 * network. This file is never loaded by production builds — `apps/web/vite.config.ts`
 * is untouched.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        // Matches every relative import of the app's API client (`../api/client.js`,
        // `../../api/client.js`, …) regardless of importer depth.
        find: /(^|.*\/)api\/client\.js$/,
        replacement: fileURLToPath(new URL('./mocks/apiClient.ts', import.meta.url)),
      },
    ],
  },
});
