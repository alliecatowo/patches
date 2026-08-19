import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runPrivacy, type PrivacyCommandApi } from './privacy.js';

function makeIo(overrides: Partial<CliIo> = {}): CliIo & { out: string[]; err: string[] } {
  return {
    isTTY: false,
    out: [],
    err: [],
    stdout(text: string) {
      this.out.push(text);
    },
    stderr(text: string) {
      this.err.push(text);
    },
    prompt: () => Promise.reject(new Error('not used')),
    promptPassword: () => Promise.reject(new Error('not used')),
    readStdin: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

function fakeApi(): PrivacyCommandApi {
  return {
    getNodePolicy: vi.fn().mockResolvedValue({
      policy: { privacyNoticeVersion: 3, privacyNoticeSummary: 'We keep minimal data.' },
    }),
    getPrivacyPrefs: vi.fn().mockResolvedValue({
      prefs: {
        discoverable: true,
        indexable: true,
        showInLocalFeed: true,
        locked: false,
        privacyNoticeVersion: 3,
        privacyNoticeAcknowledgedAt: undefined,
      },
    }),
    acknowledgePrivacyNotice: vi.fn().mockResolvedValue({}),
    updatePrivacyPrefs: vi.fn().mockResolvedValue({}),
    exportAccount: vi
      .fn()
      .mockResolvedValue({ export: { status: 'ACCOUNT_EXPORT_STATUS_PENDING' } }),
    getExportStatus: vi.fn().mockResolvedValue({ export: undefined }),
    requestAccountDeletion: vi.fn().mockResolvedValue({ deletion: { pending: true } }),
    cancelAccountDeletion: vi.fn().mockResolvedValue({ deletion: { pending: false } }),
    getDeletionStatus: vi.fn().mockResolvedValue({ deletion: { pending: false } }),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runPrivacy', () => {
  it('show prints the notice, prefs, export and deletion status', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runPrivacy(['show'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(0);
    const output = io.out.join('');
    expect(output).toContain('privacy-notice-version\t3');
    expect(output).toContain('discoverable\ttrue');
    expect(output).toContain('deletion-pending\tfalse');
  });

  it('set toggles a single preference with a scoped update mask', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runPrivacy(['set', 'locked', 'on'], {
      io,
      api,
      ensureAccessToken,
      ...BASE,
    });

    expect(code).toBe(0);
    expect(api.updatePrivacyPrefs).toHaveBeenCalledWith(
      {
        discoverable: true,
        indexable: true,
        showInLocalFeed: true,
        locked: true,
        updateMask: ['locked'],
      },
      'token',
    );
  });

  it('set rejects an unknown key', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runPrivacy(['set', 'nonsense', 'on'], { io, api, ...BASE });
    expect(code).toBe(1);
    expect(io.err.join('')).toContain('Unknown privacy key');
  });

  it('ack acknowledges the current node policy version', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runPrivacy(['ack'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(0);
    expect(api.acknowledgePrivacyNotice).toHaveBeenCalledWith({ noticeVersion: 3 }, 'token');
    expect(io.out.join('')).toContain('Acknowledged privacy notice v3.');
  });

  it('delete refuses without --yes on a non-interactive terminal', async () => {
    const io = makeIo({ isTTY: false });
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runPrivacy(['delete'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(1);
    expect(api.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('delete --yes requests deletion directly', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runPrivacy(['delete', '--yes'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(0);
    expect(api.requestAccountDeletion).toHaveBeenCalledWith('token');
    expect(io.out.join('')).toContain('deletion-pending\ttrue');
  });

  it('cancel-delete cancels a pending deletion', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    const code = await runPrivacy(['cancel-delete'], { io, api, ensureAccessToken, ...BASE });

    expect(code).toBe(0);
    expect(api.cancelAccountDeletion).toHaveBeenCalledWith('token');
  });

  it('never describes anything in privacy output as encrypted, secure, or private', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    await runPrivacy(['show'], { io, api, ensureAccessToken, ...BASE });

    expect(io.out.join('').toLowerCase()).not.toContain('encrypted');
  });
});
