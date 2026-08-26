import { describeError } from '@patches/client';
import { useCallback } from 'react';
import { toast } from 'sonner';

/** `onError` handler for TanStack Query mutations: maps the error to copy and toasts it. */
export function useErrorToast(): (error: unknown) => void {
  return useCallback((error: unknown) => {
    const described = describeError(error);
    toast.error(described.message);
  }, []);
}
