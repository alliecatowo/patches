import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import './index.css';
import './lib/theme.js';
import { useSessionKeepAlive } from './hooks/useSessionKeepAlive.js';
import { installGlobalCollectors } from './lib/diagnosticsReporter.js';
import { registerServiceWorker } from './pwa/serviceWorkerRegistration.js';
import { router } from './router.js';

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
    </QueryClientProvider>
  </StrictMode>,
);
