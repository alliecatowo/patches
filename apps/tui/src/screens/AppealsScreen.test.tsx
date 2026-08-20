import type { Appeal, ModerationNotice } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { AppealsScreen } from './AppealsScreen.js';
import { makeAppeal, makeModerationNotice } from '../test/wire-fixtures.js';

function notice(overrides: Partial<ModerationNotice> = {}): ModerationNotice {
  return makeModerationNotice(overrides);
}

function appeal(): Appeal {
  return makeAppeal({ statement: 'It was not the same link.' });
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listMyModerationNotices: vi.fn().mockResolvedValue({ notices: [notice()], page: undefined }),
    listMyAppeals: vi.fn().mockResolvedValue({ appeals: [], page: undefined }),
    createAppeal: vi.fn().mockResolvedValue({ appeal: appeal() }),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('AppealsScreen', () => {
  it('shows moderation notices with the appeal deadline', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <AppealsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('warn'));
    expect(lastFrame()).toContain('Repeated posting of the same link.');
  });

  it('files an appeal for the selected notice', async () => {
    const createAppeal = vi.fn().mockResolvedValue({ appeal: appeal() });
    const api = buildApi({ createAppeal });
    const { lastFrame, stdin } = render(
      <AppealsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('warn'));
    stdin.write('n');
    await vi.waitFor(() => expect(lastFrame()).toContain('Appeal — warn'));
    stdin.write('It was not the same link.');
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write('\r');

    await vi.waitFor(() =>
      expect(createAppeal).toHaveBeenCalledWith(
        { moderationNoticeId: 'notice-1', statement: 'It was not the same link.' },
        'token',
      ),
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('Appeal filed.'));
  });

  it('does not offer to file a second appeal for an already-appealed notice', async () => {
    const api = buildApi({
      listMyModerationNotices: vi
        .fn()
        .mockResolvedValue({ notices: [notice({ appealed: true })], page: undefined }),
    });
    const { lastFrame, stdin } = render(
      <AppealsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('appealed'));
    stdin.write('n');
    // Still on the notices list, not the filing screen.
    expect(lastFrame()).not.toContain('Appeal —');
  });

  it('Tab switches to the "my appeals" view', async () => {
    const api = buildApi({
      listMyAppeals: vi.fn().mockResolvedValue({ appeals: [appeal()], page: undefined }),
    });
    const { lastFrame, stdin } = render(
      <AppealsScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('warn'));
    stdin.write('\t');
    await vi.waitFor(() => expect(lastFrame()).toContain('my appeals'));
    expect(lastFrame()).toContain('open');
  });
});
