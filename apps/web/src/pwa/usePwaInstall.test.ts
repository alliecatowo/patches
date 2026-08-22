import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePwaInstall } from './usePwaInstall.js';

describe('usePwaInstall', () => {
  it('detects when app is installable via beforeinstallprompt event', async () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstallable).toBe(false);

    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt');
    Object.assign(event, {
      prompt: mockPrompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);

    let promptResult = false;
    await act(async () => {
      promptResult = await result.current.promptInstall();
    });

    expect(mockPrompt).toHaveBeenCalled();
    expect(promptResult).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });
});
