import { CONVERSATION_KIND, MESSAGE_REQUEST_STATUS } from '../api/wire/enums.js';
import type {
  Actor,
  Conversation,
  ConversationSecurityMode,
  Message,
  MessageRequest,
} from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import { runDm, type DmCommandApi, type DmCommandSession } from './dm.js';
import type { CliIo } from './io.js';

function actor(id: string, handle: string, displayName: string): Actor {
  return {
    id,
    handle,
    displayName,
    bio: '',
    locationText: '',
    websiteUrl: '',
    avatar: undefined,
    isLocal: true,
    joinedAt: undefined,
    counts: undefined,
    nameplate: undefined,
    flair: undefined,
    pinnedPostIds: [],
  };
}

const alice = actor('actor-alice', 'alice', 'Alice');

function conversation(id = 'conversation-1'): Conversation {
  return {
    id,
    kind: CONVERSATION_KIND.DIRECT,
    securityMode: 'CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE' as ConversationSecurityMode,
    createdBy: alice,
    members: [
      {
        actor: alice,
        joinedAt: undefined,
        leftAt: undefined,
        lastReadMessageId: '',
        muted: false,
      },
    ],
    createdAt: undefined,
    lastMessageAt: undefined,
    unreadCount: 2,
  };
}

function message(id: string, body: string): Message {
  return {
    id,
    conversationId: 'conversation-1',
    sender: alice,
    body,
    createdAt: undefined,
    deletedAt: undefined,
  };
}

function request(id: string, body: string): MessageRequest {
  return {
    id,
    sender: alice,
    recipient: undefined,
    body,
    status: MESSAGE_REQUEST_STATUS.PENDING,
    createdAt: undefined,
  };
}

interface FakeApi extends DmCommandApi {
  listConversations: ReturnType<typeof vi.fn<DmCommandApi['listConversations']>>;
  getConversation: ReturnType<typeof vi.fn<DmCommandApi['getConversation']>>;
  listMessages: ReturnType<typeof vi.fn<DmCommandApi['listMessages']>>;
  sendMessage: ReturnType<typeof vi.fn<DmCommandApi['sendMessage']>>;
  markConversationRead: ReturnType<typeof vi.fn<DmCommandApi['markConversationRead']>>;
  listMessageRequests: ReturnType<typeof vi.fn<DmCommandApi['listMessageRequests']>>;
  respondToMessageRequest: ReturnType<typeof vi.fn<DmCommandApi['respondToMessageRequest']>>;
}

function fakeApi(): FakeApi {
  return {
    listConversations: vi.fn().mockResolvedValue({ conversations: [], page: undefined }),
    getConversation: vi.fn().mockResolvedValue({ conversation: conversation() }),
    listMessages: vi.fn().mockResolvedValue({ messages: [], page: undefined }),
    sendMessage: vi.fn().mockResolvedValue({ message: undefined }),
    markConversationRead: vi.fn().mockResolvedValue({}),
    listMessageRequests: vi.fn().mockResolvedValue({ requests: [], page: undefined }),
    respondToMessageRequest: vi
      .fn()
      .mockResolvedValue({ request: undefined, conversation: undefined }),
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
  it('lists conversations with keyset flags and sanitizes remote actor text', async () => {
    const api = fakeApi();
    const output = io();
    const hostile = actor('actor-hostile', `mallory\x1b[2J`, 'Mal\x07lory');
    const row = conversation();
    row.members[0] = { ...row.members[0]!, actor: hostile };
    api.listConversations.mockResolvedValue({
      conversations: [row],
      page: { nextCursor: `next\x1b[H`, hasMore: true },
    });

    const exitCode = await runDm(
      ['list', '--cursor', 'opaque-cursor', '--limit', '7'],
      deps(api, output),
    );

    expect(exitCode).toBe(0);
    expect(api.listConversations).toHaveBeenCalledWith({ cursor: 'opaque-cursor', limit: 7 });
    expect(output.out[0]).toBe(
      "Not end-to-end encrypted — this node's operators can read these messages.\n",
    );
    expect(output.out.join('')).toContain('Mallory (@mallory[2J)');
    expect(output.out.join('')).toContain('next cursor: next[H');
    expect(output.out.join('')).not.toContain('\x1b');
  });

  it('sends a message with an idempotency id', async () => {
    const api = fakeApi();
    const output = io();
    api.sendMessage.mockResolvedValue({ message: message('message-1', 'hello there') });

    const exitCode = await runDm(['send', 'conversation-1', 'hello', 'there'], deps(api, output));

    expect(exitCode).toBe(0);
    expect(api.sendMessage).toHaveBeenCalledWith({
      clientRequestId: 'client-request-id',
      conversationId: 'conversation-1',
      body: 'hello there',
    });
    expect(output.out.join('')).toContain('Sent message-1.');
  });

  it('sanitizes text returned in a transport error', async () => {
    const api = fakeApi();
    const output = io();
    api.sendMessage.mockRejectedValue({ code: 3, details: `bad\x1b[2J request` });

    expect(await runDm(['send', 'conversation-1', 'hello'], deps(api, output))).toBe(1);
    expect(output.err.join('')).toContain('bad[2J request');
    expect(output.err.join('')).not.toContain('\x1b');
  });

  it('reads a page chronologically and marks through its newest message', async () => {
    const api = fakeApi();
    const output = io();
    api.listMessages.mockResolvedValue({
      messages: [message('newest', `new\x1b[2J`), message('older', 'old')],
      page: { nextCursor: 'older-cursor', hasMore: true },
    });

    const exitCode = await runDm(['read', 'conversation-1', '--limit', '2'], deps(api, output));

    expect(exitCode).toBe(0);
    expect(api.getConversation).toHaveBeenCalledWith({ id: 'conversation-1' });
    expect(api.listMessages).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      cursor: '',
      limit: 2,
    });
    expect(api.markConversationRead).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      throughMessageId: 'newest',
    });
    expect(output.out.join('').indexOf('\told')).toBeLessThan(
      output.out.join('').indexOf('\tnew[2J'),
    );
  });

  it('lists, accepts, and declines requests', async () => {
    const api = fakeApi();
    api.listMessageRequests.mockResolvedValue({
      requests: [request('request-1', `hello\x1b[H`)],
      page: undefined,
    });

    const listed = io();
    expect(await runDm(['requests'], deps(api, listed))).toBe(0);
    expect(api.listMessageRequests).toHaveBeenCalledWith({ cursor: '', limit: 20 });
    expect(listed.out.join('')).toContain('hello[H');

    const accepted = io();
    expect(await runDm(['requests', 'accept', 'request-1'], deps(api, accepted))).toBe(0);
    expect(api.respondToMessageRequest).toHaveBeenCalledWith({ id: 'request-1', accept: true });

    const declined = io();
    expect(await runDm(['requests', 'decline', 'request-2'], deps(api, declined))).toBe(0);
    expect(api.respondToMessageRequest).toHaveBeenCalledWith({ id: 'request-2', accept: false });
  });
});
