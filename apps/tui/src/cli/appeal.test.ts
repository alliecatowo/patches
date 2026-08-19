import { APPEAL_STATUS, type Appeal } from '@patches/proto';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runAppeal, type AppealCommandApi } from './appeal.js';

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
    readStdin: () => Promise.resolve(''),
    ...overrides,
  };
}

function appeal(): Appeal {
  return {
    id: 'appeal-1',
    moderationNoticeId: 'notice-1',
    statement: 'I was not warned first.',
    status: APPEAL_STATUS.OPEN,
    createdAt: undefined,
    resolvedAt: undefined,
    resolutionReason: '',
  };
}

function fakeApi(): AppealCommandApi {
  return {
    listMyAppeals: vi.fn().mockResolvedValue({ appeals: [appeal()], page: undefined }),
    createAppeal: vi.fn().mockResolvedValue({ appeal: appeal() }),
    getAppeal: vi.fn().mockResolvedValue({ appeal: appeal() }),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runAppeal', () => {
  it('lists the caller’s own appeals', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runAppeal(['list'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(0);
    expect(io.out.join('')).toContain('appeal-1\tAPPEAL_STATUS_OPEN\tnotice-1');
  });

  it('creates an appeal for a moderation notice with a statement flag', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runAppeal(['create', 'notice-1', '--statement', 'I was not warned first.'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(0);
    expect(api.createAppeal).toHaveBeenCalledWith('notice-1', 'I was not warned first.', 'token');
  });

  it('reads the statement from stdin when --statement is omitted', async () => {
    const io = makeIo({ readStdin: () => Promise.resolve('from stdin') });
    const api = fakeApi();
    const code = await runAppeal(['create', 'notice-1'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(0);
    expect(api.createAppeal).toHaveBeenCalledWith('notice-1', 'from stdin', 'token');
  });

  it('shows an appeal, including its statement and resolution', async () => {
    const io = makeIo();
    const api = fakeApi();
    vi.mocked(api.getAppeal).mockResolvedValue({
      appeal: { ...appeal(), resolutionReason: 'Notice upheld.' },
    });
    const code = await runAppeal(['show', 'appeal-1'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(0);
    expect(io.out.join('')).toContain('statement\tI was not warned first.');
    expect(io.out.join('')).toContain('resolution\tNotice upheld.');
  });
});
