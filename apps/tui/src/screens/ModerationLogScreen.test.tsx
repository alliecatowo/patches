import {
  MODERATION_ACTION_TYPE,
  MODERATION_LOG_SUBJECT_KIND,
  MODERATION_REASON_CATEGORY,
} from '../api/wire/enums.js';
import type { ModerationLogEntry } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { ModerationLogScreen } from './ModerationLogScreen.js';

function domainEntry(): ModerationLogEntry {
  return {
    id: 'log-1',
    action: MODERATION_ACTION_TYPE.DOMAIN_BLOCK,
    subjectKind: MODERATION_LOG_SUBJECT_KIND.DOMAIN,
    subjectDomain: 'spam.example',
    reasonCategory: MODERATION_REASON_CATEGORY.SPAM,
    appealed: false,
    createdAt: undefined,
  };
}

function accountEntry(): ModerationLogEntry {
  return {
    id: 'log-2',
    action: MODERATION_ACTION_TYPE.SUSPEND,
    subjectKind: MODERATION_LOG_SUBJECT_KIND.ACCOUNT,
    subjectDomain: '',
    reasonCategory: MODERATION_REASON_CATEGORY.HARASSMENT,
    appealed: true,
    createdAt: undefined,
  };
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    listModerationLog: vi
      .fn()
      .mockResolvedValue({ entries: [domainEntry(), accountEntry()], page: undefined }),
    ...overrides,
  } as unknown as PatchesApi;
}

describe('ModerationLogScreen', () => {
  it('renders without a session (unauthenticated read)', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <ModerationLogScreen api={api} isActive onBack={() => undefined} />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('spam.example'));
    expect(lastFrame()).toContain('domain_block');
  });

  it('never shows a handle/actor id for a non-domain entry', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <ModerationLogScreen api={api} isActive onBack={() => undefined} />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('account'));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('appealed');
    expect(frame).not.toContain('@');
  });

  it('never describes anything on this screen as encrypted, secure, or private', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <ModerationLogScreen api={api} isActive onBack={() => undefined} />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('spam.example'));
    expect((lastFrame() ?? '').toLowerCase()).not.toContain('encrypted');
  });
});
