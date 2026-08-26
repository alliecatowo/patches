import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

/**
 * `useMutation`, but every call gets an `AbortSignal` that fires when this component
 * unmounts, and `onSuccess`/`onError`/`onSettled` never run once that has happened (B-164).
 * React Query v5 already refuses to re-render an unmounted observer — what it does *not*
 * guard is a callback's own side effects: a stray success toast, cache write, or
 * `navigate()` call for a screen the caller has already left. Aborting also stops the
 * underlying request from finishing pointlessly instead of just muting its result.
 *
 * `mutationFn` takes the variables plus a per-call `AbortSignal` — thread it into the
 * underlying call's cancellation point (a Connect RPC's `CallOptions.signal`, `fetch`,
 * etc.) so the request itself is cancelled, not only its callbacks silenced. A
 * `mutationFn` with no abortable step of its own (for example a WebAuthn ceremony) can
 * ignore the signal — the mounted-check on the callbacks below still applies.
 */
export function useAbortableMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: Omit<UseMutationOptions<TData, TError, TVariables, TOnMutateResult>, 'mutationFn'> & {
    mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;
  },
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  const mountedRef = useRef(true);
  const controllersRef = useRef(new Set<AbortController>());

  useEffect(() => {
    const controllers = controllersRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };
  }, []);

  const { mutationFn, onSuccess, onError, onSettled, ...rest } = options;

  return useMutation({
    ...rest,
    mutationFn: (variables: TVariables) => {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      return mutationFn(variables, controller.signal).finally(() => {
        controllersRef.current.delete(controller);
      });
    },
    onSuccess: (...args: Parameters<NonNullable<typeof onSuccess>>) => {
      if (!mountedRef.current) return;
      onSuccess?.(...args);
    },
    onError: (...args: Parameters<NonNullable<typeof onError>>) => {
      if (!mountedRef.current) return;
      onError?.(...args);
    },
    onSettled: (...args: Parameters<NonNullable<typeof onSettled>>) => {
      if (!mountedRef.current) return;
      onSettled?.(...args);
    },
  });
}
