import {
  MODERATION_ACTION_TYPE,
  MODERATION_LOG_SUBJECT_KIND,
  MODERATION_REASON_CATEGORY,
} from '../api/wire/enums.js';
import type { ModerationLogEntry } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import type { CliIo } from './io.js';
import { runModlog, type ModerationLogCommandApi } from './modlog.js';
import { makeModerationLogEntry } from '../test/wire-fixtures.js';

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

function domainEntry(): ModerationLogEntry {
  return makeModerationLogEntry();
}

function accountEntry(): ModerationLogEntry {
  return makeModerationLogEntry({
    id: 'log-2',
    action: MODERATION_ACTION_TYPE.SUSPEND,
    subjectKind: MODERATION_LOG_SUBJECT_KIND.ACCOUNT,
    subjectDomain: '',
    reasonCategory: MODERATION_REASON_CATEGORY.HARASSMENT,
    appealed: true,
  });
}

const BASE = { env: {}, target: 'node.test:443', insecure: false } as const;

describe('runModlog', () => {
  it('is unauthenticated and prints domain entries fully identified', async () => {
    const io = makeIo();
    const api: ModerationLogCommandApi = {
      listModerationLog: vi.fn().mockResolvedValue({ entries: [domainEntry()], page: undefined }),
    };
    const code = await runModlog([], { io, api, ...BASE });
    expect(code).toBe(0);
    expect(io.out.join('')).toContain('spam.example');
  });

  it('never prints a handle/actor/post id for an account entry — anonymized by construction', async () => {
    const io = makeIo();
    const api: ModerationLogCommandApi = {
      listModerationLog: vi.fn().mockResolvedValue({ entries: [accountEntry()], page: undefined }),
    };
    const code = await runModlog([], { io, api, ...BASE });
    expect(code).toBe(0);
    const output = io.out.join('');
    expect(output).toContain('log-2');
    expect(output).toContain('account');
    expect(output).toContain('true'); // appealed
    expect(output).not.toContain('@');
  });

  it('paginates with cursor/limit flags', async () => {
    const io = makeIo();
    const listModerationLog = vi.fn().mockResolvedValue({
      entries: [],
      page: { hasMore: true, nextCursor: 'next' },
    });
    const code = await runModlog(['--cursor', 'abc', '--limit', '5'], {
      io,
      api: { listModerationLog },
      ...BASE,
    });
    expect(code).toBe(0);
    expect(listModerationLog).toHaveBeenCalledWith('abc', 5);
    expect(io.out.join('')).toContain('next-cursor\tnext');
  });
});
