import { describeError } from '@patches/client';
import { useCallback } from 'react';

import { useToast } from '../components/ToastProvider.js';

/** `onError` handler for TanStack Query mutations: maps the error to copy and toasts it. */
export function useErrorToast(): (error: unknown) => void {
  const { pushToast } = useToast();
  return useCallback(
    (error: unknown) => {
      const described = describeError(error);
      pushToast({ message: described.message, tone: 'error' });
    },
    [pushToast],
  );
}
