import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import type { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import './index.css';
import './lib/theme.js';
import { useSessionKeepAlive } from './hooks/useSessionKeepAlive.js';
import { installGlobalCollectors } from './lib/diagnosticsReporter.js';
import { initWebVitals } from './lib/webVitals.js';
import { registerServiceWorker } from './pwa/serviceWorkerRegistration.js';
import { router } from './router.js';

/**
 * B-157: dynamic `import()` (not a static import of `@tanstack/react-query-devtools`)
 * so Rollup never has a reachable import specifier to bundle for a production build —
 * a static import guarded only by an `if` still ships the module, just dead-code-branched
 * at runtime. Dev-only by construction: this branch itself is stripped by Vite's
 * `import.meta.env.DEV` constant folding before Rollup ever sees the `import()` call.
 */
function ReactQueryDevtoolsInDev(): ReactElement | null {
  const [Devtools, setDevtools] = useState<typeof ReactQueryDevtools | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import('@tanstack/react-query-devtools').then((module) => {
      if (!cancelled) setDevtools(() => module.ReactQueryDevtools);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return Devtools === null ? null : <Devtools initialIsOpen={false} />;
}

/** Renders nothing; only exists to host `useSessionKeepAlive` as a sibling of the
 * router, since app-wide session state doesn't belong to any one route. */
function SessionKeepAlive(): null {
  useSessionKeepAlive();
  return null;
}

registerServiceWorker();
// B-162: previously only installed when `IssueReporter` first mounted (`/report`,
// `/settings/*`, 404) — every other route ran with no breadcrumb ring and no `pagehide`
// flush, so "shake to report" had nothing to show for most sessions. Idempotent
// (`installGlobalCollectors` no-ops if already installed), so IssueReporter's own call
// stays safe as a fallback for embedders that don't boot through this file.
installGlobalCollectors();
// B-166: no-ops unless VITE_WEB_VITALS_ENDPOINT is set (docs/operations/web.md) — see
// lib/webVitals.ts for why there is no ingest endpoint to point it at yet.
initWebVitals();

// Build identity, readable from devtools (`window.__PATCHES_WEB__`) and printed once on boot so
// "which web version am I on?" is answerable without reading the footer.
Object.assign(window, {
  __PATCHES_WEB__: { version: __PATCHES_WEB_VERSION__, builtAt: __PATCHES_WEB_BUILT_AT__ },
});
// eslint-disable-next-line no-console -- intentional one-line boot banner with the build version
console.info(`patches web ${__PATCHES_WEB_VERSION__} (built ${__PATCHES_WEB_BUILT_AT__})`);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (container === null) throw new Error('#root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <SessionKeepAlive />
      {/* Sibling of the router, not a wrapper: sonner renders its own portal, and toasts
          (e.g. session-expiry, see api/client.ts) can fire from outside the React tree. */}
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
      {import.meta.env.DEV && <ReactQueryDevtoolsInDev />}
    </QueryClientProvider>
  </StrictMode>,
);
