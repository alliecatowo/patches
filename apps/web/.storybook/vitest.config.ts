import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import storybookViteConfig from './vite.config.js';

/**
 * The dedicated Vitest config for the Storybook project (run explicitly via
 * `test-storybook` — plain `vitest run` keeps using `vitest.config.ts` and never picks
 * this up, so `pnpm verify`'s jsdom suite is untouched). It merges the same minimal
 * Vite config the Storybook builder uses, so browser-mode tests get the identical
 * `react()` + API-mock alias pipeline. No Storybook server is needed to run these
 * tests (portable stories), which keeps the CI smoke cheap.
 */
export default mergeConfig(
  storybookViteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          plugins: [
            storybookTest({
              configDir: '.storybook',
            }),
          ],
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              provider: playwright({}),
              headless: true,
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
);
