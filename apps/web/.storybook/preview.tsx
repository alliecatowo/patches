import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { MemoryRouter } from 'react-router-dom';

import type { Decorator, Preview } from '@storybook/react-vite';

import '../src/index.css';
import { setThemePreference, THEME_CATALOG, type ThemePreference } from '../src/lib/theme.js';

/**
 * A fresh QueryClient per story mount: route stories refire their queries when the
 * story switches (a shared client would serve a stale `node-info` from the previous
 * story's cache for 60s and break scenario switching).
 */
const WithAppProviders: Decorator = (Story) => {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Story />
        <Toaster
          theme="system"
          toastOptions={{
            style: {
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_CATALOG.some((theme) => theme.id === value);
}

/**
 * Theme toolbar wired to the app's own mechanism (`src/lib/theme.ts` — `data-theme` on
 * `<html>` + the CSS custom properties in `index.css`). No parallel theming system
 * exists here: switching this global calls the same `setThemePreference` the Appearance
 * settings route calls, so stories render with exactly the production token pipeline.
 */
const WithTheme: Decorator = (Story, { globals }) => {
  const theme = isThemePreference(globals.theme) ? globals.theme : 'patches';
  useEffect(() => {
    setThemePreference(theme);
  }, [theme]);
  return <Story />;
};

/**
 * The owner's viewport matrix as the complete, first-class preset set
 * (docs/research/storybook-web.md §3). These resize the story iframe only — they do
 * NOT emulate touch, deviceScaleFactor, or `display-mode: standalone`; real touch
 * stays in the Playwright E2E suite.
 */
const preview: Preview = {
  parameters: {
    layout: 'padded',
    viewport: {
      options: {
        mobilePwa: {
          name: 'Mobile PWA (375×667, portrait-primary)',
          styles: { width: '375px', height: '667px' },
          type: 'mobile',
        },
        tablet: {
          name: 'Tablet (768×1024, portrait)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
        desktop: {
          name: 'Desktop (1280×800)',
          styles: { width: '1280px', height: '800px' },
          type: 'desktop',
        },
      },
    },
    // Phase 1: axe violations surface in the Accessibility panel as todos, never fail
    // a check. Promote per-component to 'error' as issues are fixed.
    a11y: { test: 'todo' },
  },
  globalTypes: {
    theme: {
      description: 'App theme — applies the app data-theme token set (src/lib/theme.ts)',
      toolbar: {
        icon: 'contrast',
        title: 'Theme',
        items: THEME_CATALOG.map((theme) => ({ value: theme.id, title: theme.name })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    viewport: { value: 'mobilePwa', isRotated: false },
    theme: 'patches',
  },
  decorators: [WithAppProviders, WithTheme],
};

export default preview;
