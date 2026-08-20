import { dateToTimestamp } from '@patches/proto';
import type {
  AccountDeletionStatus,
  GetDeletionStatusResponse,
  GetExportStatusResponse,
  GetNodePolicyResponse,
  GetPrivacyPrefsResponse,
  PrivacyPrefs,
} from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { PrivacyScreen } from './PrivacyScreen.js';

function prefs(overrides: Partial<PrivacyPrefs> = {}): PrivacyPrefs {
  return {
    discoverable: true,
    indexable: true,
    showInLocalFeed: true,
    locked: false,
    privacyNoticeVersion: 0,
    privacyNoticeAcknowledgedAt: undefined,
    ...overrides,
  };
}

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  const getNodePolicy = vi.fn<() => Promise<GetNodePolicyResponse>>().mockResolvedValue({
    policy: {
      privacyNoticeSummary: 'We keep the minimum data required to run this node.',
      privacyNoticeVersion: 2,
      privacyNoticeUrl: '',
      termsUrl: '',
      moderatorContact: '',
      appealInstructions: '',
      federationStance: 'FEDERATION_STANCE_OPEN_WITH_BLOCKLIST',
      domainPolicies: [],
      dataLocation: '',
      retention: undefined,
      operatorIdentity: '',
      labelVocabulary: [],
      accountDeletionGracePeriodDays: 30,
      appealWindowDays: 14,
    },
  } as unknown as GetNodePolicyResponse);
  const getPrivacyPrefs = vi
    .fn<() => Promise<GetPrivacyPrefsResponse>>()
    .mockResolvedValue({ prefs: prefs() });
  const getExportStatus = vi
    .fn<() => Promise<GetExportStatusResponse>>()
    .mockResolvedValue({ export: undefined });
  const getDeletionStatus = vi
    .fn<() => Promise<GetDeletionStatusResponse>>()
    .mockResolvedValue({ deletion: { pending: false } as AccountDeletionStatus });

  return {
    target: 'patches.test:50051',
    getNodePolicy,
    getPrivacyPrefs,
    getExportStatus,
    getDeletionStatus,
    ...overrides,
  } as unknown as PatchesApi;
}

describe('PrivacyScreen', () => {
  it('shows the privacy notice and unacknowledged state', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <PrivacyScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() =>
      expect(lastFrame()).toContain('We keep the minimum data required to run this node.'),
    );
    expect(lastFrame()).toContain('Not yet acknowledged');
    expect(lastFrame()).toContain('Discoverable in search & directory: on');
  });

  it('acknowledges the notice on "a" and calls AcknowledgePrivacyNotice with the current version', async () => {
    const acknowledgePrivacyNotice = vi.fn().mockResolvedValue({
      prefs: prefs({
        privacyNoticeVersion: 2,
        privacyNoticeAcknowledgedAt: dateToTimestamp(new Date()),
      }),
    });
    const api = buildApi({ acknowledgePrivacyNotice });
    const { lastFrame, stdin } = render(
      <PrivacyScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Not yet acknowledged'));
    stdin.write('a');
    await vi.waitFor(() =>
      expect(acknowledgePrivacyNotice).toHaveBeenCalledWith({ noticeVersion: 2 }, 'token'),
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('Acknowledged.'));
  });

  // A-053 (spec §197.1: "every client MUST show the new summary at next session start and
  // record a fresh acknowledgement"): an actor who acknowledged an older version must see the
  // notice as unacknowledged again, even though they already have an `acknowledged_at`
  // timestamp — the version bump, not just the presence of a timestamp, is what matters.
  it('shows the notice as unacknowledged again when the actor acknowledged an older version', async () => {
    const api = buildApi({
      getPrivacyPrefs: vi.fn<() => Promise<GetPrivacyPrefsResponse>>().mockResolvedValue({
        prefs: prefs({
          privacyNoticeVersion: 1,
          privacyNoticeAcknowledgedAt: dateToTimestamp(new Date('2026-01-01T00:00:00Z')),
        }),
      }),
    });
    const { lastFrame } = render(
      <PrivacyScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );

    // `buildApi`'s node policy is at version 2; the actor acknowledged version 1.
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('We keep the minimum data required to run this node.'),
    );
    expect(lastFrame()).toContain('Not yet acknowledged');
  });

  it('toggles the selected discoverability preference with a single-field update mask', async () => {
    const updatePrivacyPrefs = vi.fn().mockResolvedValue({ prefs: prefs({ discoverable: false }) });
    const api = buildApi({ updatePrivacyPrefs });
    const { lastFrame, stdin } = render(
      <PrivacyScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Discoverable in search & directory'));
    stdin.write(' ');
    await vi.waitFor(() =>
      expect(updatePrivacyPrefs).toHaveBeenCalledWith(
        {
          discoverable: false,
          indexable: true,
          showInLocalFeed: true,
          locked: false,
          updateMask: ['discoverable'],
        },
        'token',
      ),
    );
  });

  it('asks for confirmation before requesting account deletion', async () => {
    const onConfirm =
      vi.fn<
        (request: { id: string; title: string; body: string; onConfirm: () => void }) => void
      >();
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <PrivacyScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={onConfirm}
        onBack={() => undefined}
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Discoverable in search & directory'));
    stdin.write('d');
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[0]?.id).toBe('privacy:delete-account');
  });

  it('never describes anything on this screen as encrypted, secure, or private', async () => {
    const api = buildApi();
    const { lastFrame } = render(
      <PrivacyScreen
        api={api}
        isActive
        ensureAccessToken={() => Promise.resolve('token')}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('Discoverable in search & directory'));
    const frame = lastFrame() ?? '';
    expect(frame.toLowerCase()).not.toContain('encrypted');
  });
});
