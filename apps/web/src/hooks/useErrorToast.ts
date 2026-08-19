import { useCallback } from 'react';

import { describeError } from '../api/errors.js';
import { useToast } from '../components/ToastProvider.js';

/** `onError` handler for TanStack Query mutations: maps the error to copy and toasts it. */
export function useErrorToast(): (error: unknown) => void {
  const { pushToast } = useToast();
  return useCallback(
    (error: unknown) => {
      const described = describeError(error);
      pushToast({ title: described.title, message: described.message, tone: 'error' });
    },
    [pushToast],
  );
}
