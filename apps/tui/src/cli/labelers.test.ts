import { LABEL_ACTION } from '../api/wire/enums.js';
import type { Labeler } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runLabelers, type LabelerCommandApi } from './labelers.js';

function makeIo(): CliIo & { out: string[]; err: string[] } {
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
  };
}

function labeler(): Labeler {
  return {
    id: 'labeler-1',
    actor: { id: 'a1', handle: 'modbot' } as Labeler['actor'],
    community: undefined,
    isNodeLabeler: false,
    vocabulary: [
      { value: 'spam', description: '', defaultAction: LABEL_ACTION.WARN, mandatory: false },
    ],
    createdAt: undefined,
  };
}

function fakeApi(): LabelerCommandApi {
  return {
    listLabelers: vi.fn().mockResolvedValue({ labelers: [labeler()], page: undefined }),
    subscribeLabeler: vi.fn().mockResolvedValue({}),
    unsubscribeLabeler: vi.fn().mockResolvedValue({}),
    setLabelerSubscriptionAction: vi.fn().mockResolvedValue({}),
  };
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runLabelers', () => {
  it('lists labelers without requiring a session', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runLabelers(['list'], { io, api, ...BASE });
    expect(code).toBe(0);
    expect(io.out.join('')).toContain('labeler-1\t@modbot\tspam');
  });

  it('subscribes and unsubscribes by labeler id', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');

    expect(
      await runLabelers(['subscribe', 'labeler-1'], { io, api, ensureAccessToken, ...BASE }),
    ).toBe(0);
    expect(api.subscribeLabeler).toHaveBeenCalledWith('labeler-1', 'token');

    expect(
      await runLabelers(['unsubscribe', 'labeler-1'], { io, api, ensureAccessToken, ...BASE }),
    ).toBe(0);
    expect(api.unsubscribeLabeler).toHaveBeenCalledWith('labeler-1', 'token');
  });

  it('sets a per-value action override', async () => {
    const io = makeIo();
    const api = fakeApi();
    const ensureAccessToken = vi.fn().mockResolvedValue('token');
    const code = await runLabelers(['action', 'labeler-1', 'spam', 'ignore'], {
      io,
      api,
      ensureAccessToken,
      ...BASE,
    });
    expect(code).toBe(0);
    expect(api.setLabelerSubscriptionAction).toHaveBeenCalledWith(
      'labeler-1',
      'spam',
      LABEL_ACTION.IGNORE,
      'token',
    );
  });

  it('rejects an unknown action word', async () => {
    const io = makeIo();
    const api = fakeApi();
    const code = await runLabelers(['action', 'labeler-1', 'spam', 'nonsense'], {
      io,
      api,
      ensureAccessToken: vi.fn().mockResolvedValue('token'),
      ...BASE,
    });
    expect(code).toBe(1);
    expect(api.setLabelerSubscriptionAction).not.toHaveBeenCalled();
  });
});
