import { create } from '@bufbuild/protobuf';
import { ListConversationsResponseSchema } from '@patches/proto/es';
import type { Actor, Conversation } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import { runDm, type DmCommandApi, type DmCommandSession } from './dm.js';
import type { CliIo } from './io.js';
import { makeActor, makeConversation, makeConversationMember, makePageInfo } from '../test/wire-fixtures.js';

function actor(id: string, handle: string, displayName: string): Actor {
  return makeActor({ id, handle, displayName });
}

const alice = actor('actor-alice', 'alice', 'Alice');

function conversation(id = 'conversation-1'): Conversation {
  return makeConversation({
    id,
    createdBy: alice,
    members: [makeConversationMember({ actor: alice })],
    unreadCount: 2,
  });
}

interface FakeApi extends DmCommandApi {
  listConversations: ReturnType<typeof vi.fn<DmCommandApi['listConversations']>>;
  getConversation: ReturnType<typeof vi.fn<DmCommandApi['getConversation']>>;
  markConversationRead: ReturnType<typeof vi.fn<DmCommandApi['markConversationRead']>>;
}

function fakeApi(): FakeApi {
  return {
    listConversations: vi.fn().mockResolvedValue({ conversations: [], page: undefined }),
    getConversation: vi.fn().mockResolvedValue({ conversation: conversation() }),
    markConversationRead: vi.fn().mockResolvedValue({}),
  };
}

function io(): CliIo & { out: string[]; err: string[] } {
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

function deps(api: DmCommandApi, output: CliIo): Parameters<typeof runDm>[1] {
  const session: DmCommandSession = { api, close: vi.fn() };
  return {
    io: output,
    env: {},
    target: '127.0.0.1:50051',
    insecure: true,
    openSession: () => Promise.resolve(session),
    createRequestId: () => 'client-request-id',
  };
}

describe('runDm', () => {
  it('lists conversations with keyset flags, sanitizes remote actor text, and states the accurate E2EE disclosure', async () => {
    const api = fakeApi();
    const output = io();
    const hostile = actor('actor-hostile', `mallory\x1b[2J`, 'Mal\x07lory');
    const row = conversation();
    row.members[0] = { ...row.members[0]!, actor: hostile };
    api.listConversations.mockResolvedValue(
      create(ListConversationsResponseSchema, {
        conversations: [row],
        page: makePageInfo({ nextCursor: `next\x1b[H`, hasMore: true }),
      }),
    );

    const exitCode = await runDm(
      ['list', '--cursor', 'opaque-cursor', '--limit', '7'],
      deps(api, output),
    );

    expect(exitCode).toBe(0);
    expect(api.listConversations).toHaveBeenCalledWith({ cursor: 'opaque-cursor', limit: 7 });
    expect(output.out[0]).toBe(
      'End-to-end encrypted. This node cannot read these messages, but it can see who you message and when.\n',
    );
    expect(output.out.join('')).toContain('Mallory (@mallory[2J)');
    expect(output.out.join('')).toContain('next cursor: next[H');
    expect(output.out.join('')).not.toContain('\x1b');
  });

  it('refuses to send, pointing at the interactive app, since no headless surface holds E2EE keys', async () => {
    const api = fakeApi();
    const output = io();

    const exitCode = await runDm(['send', 'conversation-1', 'hello'], deps(api, output));

    expect(exitCode).toBe(1);
    expect(api.getConversation).not.toHaveBeenCalled();
    expect(output.err.join('')).toContain('end-to-end encryption');
    expect(output.err.join('')).toContain('interactive app');
  });

  it('refuses to read for the same reason', async () => {
    const api = fakeApi();
    const output = io();

    const exitCode = await runDm(['read', 'conversation-1'], deps(api, output));

    expect(exitCode).toBe(1);
    expect(output.err.join('')).toContain('interactive app');
  });

  it('unknown subcommand still reports usage', async () => {
    const api = fakeApi();
    const output = io();

    expect(await runDm(['requests'], deps(api, output))).toBe(1);
    expect(output.err.join('')).toContain('Unknown dm subcommand');
  });
});
