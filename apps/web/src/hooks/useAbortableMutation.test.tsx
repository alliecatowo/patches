import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAbortableMutation } from './useAbortableMutation.js';

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useAbortableMutation', () => {
  it('threads a per-call AbortSignal into mutationFn', async () => {
    const mutationFn = vi.fn((_variables: void, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return Promise.resolve('ok');
    });
    const { result } = renderHook(() => useAbortableMutation({ mutationFn }), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight call and swallows onSuccess/onError on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveMutation: (() => void) | undefined;
    const mutationFn = vi.fn((_variables: void, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<string>((resolve, reject) => {
        resolveMutation = () => resolve('ok');
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const { result, unmount } = renderHook(
      () => useAbortableMutation({ mutationFn, onSuccess, onError }),
      { wrapper },
    );

    result.current.mutate();
    await waitFor(() => expect(capturedSignal).toBeDefined());

    unmount();

    expect(capturedSignal?.aborted).toBe(true);

    // A late resolution (a race the abort didn't win) must still not run the callbacks —
    // the mounted-check guards independently of whether the underlying call honoured the
    // signal, so this covers `mutationFn`s (like a WebAuthn ceremony) that can't be aborted.
    resolveMutation?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
