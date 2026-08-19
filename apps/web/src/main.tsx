import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './index.css';
import { router } from './router.js';
import { ToastProvider } from './components/ToastProvider.js';

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
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
