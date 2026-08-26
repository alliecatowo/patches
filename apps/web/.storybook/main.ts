import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 10 (H-029 phase 1) for the web client. The Vite builder is pointed at
 * `.storybook/vite.config.ts` — a minimal config with just `react()` plus the API-client
 * mock alias — instead of the app's `vite.config.ts`, so the PWA plugin, bundle
 * visualizer, and build-version `define`s of the deployable app never apply here
 * (docs/research/storybook-web.md §2).
 */
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: './.storybook/vite.config.ts',
      },
    },
  },
};

export default config;
