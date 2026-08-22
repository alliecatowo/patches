import type { Actor } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { ActorListScreen } from './ActorListScreen.js';
import { makeActor } from '../test/wire-fixtures.js';

function actor(handle: string): Actor {
  return makeActor({ id: `id-${handle}`, handle, displayName: `${handle.toUpperCase()}` });
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    ...overrides,
  } as unknown as PatchesApi;
}

describe('ActorListScreen', () => {
  it('lists actors and allows selecting/opening profile', async () => {
    const api = buildApi();
    const onOpenProfile = vi.fn();
    const onBack = vi.fn();

    const fetchPage = vi.fn().mockResolvedValue({
      items: [actor('violet'), actor('allie')],
      page: undefined,
    });

    const { lastFrame, stdin } = render(
      <ActorListScreen
        api={api}
        title="@violet's followers"
        fetchPage={fetchPage}
        isActive
        onBack={onBack}
        onOpenProfile={onOpenProfile}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('@violet');
      expect(lastFrame()).toContain('@allie');
    });

    stdin.write('\r');
    expect(onOpenProfile).toHaveBeenCalledWith(expect.objectContaining({ handle: 'violet' }));
  });
});
