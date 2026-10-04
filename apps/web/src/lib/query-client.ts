import { QueryClient } from '@tanstack/react-query';

import { queryRetryDelay, shouldRetryQuery } from './queryRetry.js';

/** The app's single react-query cache. It lives in a module (not `main.tsx`) so session
 * changes in `api/client.ts` can drop it: cached timelines, inboxes and profiles belong to the
 * actor that fetched them, and must never flash for the next user on a shared device (F-M3). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});
