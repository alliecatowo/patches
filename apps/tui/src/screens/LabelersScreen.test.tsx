import { LABEL_ACTION } from '../api/wire/enums.js';
import type { Actor, Labeler } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { LabelersScreen } from './LabelersScreen.js';
import { makeActor, makeLabeler, makeLabelVocabularyEntry } from '../test/wire-fixtures.js';

function actor(handle: string): Actor {
  return makeActor({ id: 'a1', handle });
}

function labeler(): Labeler {
  return makeLabeler({
    actor: actor('modbot'),
    vocabulary: [
      makeLabelVocabularyEntry({
        value: 'spam',
        description: '',
        defaultAction: LABEL_ACTION.WARN,
        mandatory: false,
      }),
      makeLabelVocabularyEntry({
        value: 'nsfw',
        description: '',
        defaultAction: LABEL_ACTION.COLLAPSE,
        mandatory: true,
      }),
    ],
  });
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listLabelers: vi.fn().mockResolvedValue({ labelers: [labeler()], page: undefined }),
    subscribeLabeler: vi.fn().mockResolvedValue({}),
    unsubscribeLabeler: vi.fn().mockResolvedValue({}),
    setLabelerSubscriptionAction: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('LabelersScreen', () => {
  it('lists labelers and their vocabulary', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <LabelersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('@modbot'));
    expect(lastFrame()).toContain('spam: warn');
    expect(lastFrame()).toContain('nsfw: collapse (mandatory)');
  });

  it('subscribes to the selected labeler', async () => {
    const subscribeLabeler = vi.fn().mockResolvedValue({});
    const api = buildApi({ subscribeLabeler });
    const { lastFrame, stdin } = render(
      <LabelersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('@modbot'));
    stdin.write('S');
    await vi.waitFor(() =>
      expect(subscribeLabeler).toHaveBeenCalledWith({ labelerId: 'labeler-1' }, 'token'),
    );
  });

  it('cycles the action for a non-mandatory value', async () => {
    const setLabelerSubscriptionAction = vi.fn().mockResolvedValue({});
    const api = buildApi({ setLabelerSubscriptionAction });
    const { lastFrame, stdin } = render(
      <LabelersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('spam: warn'));
    stdin.write('a');
    await vi.waitFor(() =>
      expect(setLabelerSubscriptionAction).toHaveBeenCalledWith(
        { labelerId: 'labeler-1', value: 'spam', action: LABEL_ACTION.COLLAPSE },
        'token',
      ),
    );
  });

  it('refuses to change a mandatory value', async () => {
    const setLabelerSubscriptionAction = vi.fn().mockResolvedValue({});
    const api = buildApi({ setLabelerSubscriptionAction });
    const { lastFrame, stdin } = render(
      <LabelersScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('spam: warn'));
    stdin.write('l'); // move to the nsfw (mandatory) value
    await vi.waitFor(() => expect(lastFrame()).toContain('› nsfw'));
    stdin.write('a');
    await vi.waitFor(() => expect(lastFrame()).toContain('mandatory'));
    expect(setLabelerSubscriptionAction).not.toHaveBeenCalled();
  });
});
