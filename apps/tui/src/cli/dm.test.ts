import { create } from '@bufbuild/protobuf';
import {
  ConversationSchema,
  GetConversationResponseSchema,
  ListConversationsResponseSchema,
  ListMessageRequestsResponseSchema,
  ListMessagesResponseSchema,
  SendMessageResponseSchema,
} from '@patches/proto/es';
import { CONVERSATION_SECURITY_MODE } from '../api/wire/enums.js';
import type { Actor, Conversation, Message, MessageRequest } from '../api/wire/types.js';
import { describe, expect, it, vi } from 'vitest';

import { runDm, type DmCommandApi, type DmCommandSession } from './dm.js';
import type { CliIo } from './io.js';
import {
  makeActor,
  makeConversation,
  makeConversationMember,
  makeMessage,
  makeMessageRequest,
  makePageInfo,
} from '../test/wire-fixtures.js';

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

function message(id: string, body: string): Message {
  return makeMessage({ id, sender: alice, body });
}

function request(id: string, body: string): MessageRequest {
  return makeMessageRequest({ id, sender: alice, body });
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
      "Not end-to-end encrypted — this node's operators can read these messages.\n",
    );
    expect(output.out.join('')).toContain('Mallory (@mallory[2J)');
    expect(output.out.join('')).toContain('next cursor: next[H');
    expect(output.out.join('')).not.toContain('\x1b');
  });

  it('sends a message with an idempotency id', async () => {
    const api = fakeApi();
    const output = io();
    api.sendMessage.mockResolvedValue(
      create(SendMessageResponseSchema, { message: message('message-1', 'hello there') }),
    );

    const exitCode = await runDm(['send', 'conversation-1', 'hello', 'there'], deps(api, output));

    expect(exitCode).toBe(0);
    expect(api.getConversation).toHaveBeenCalledWith({ id: 'conversation-1' });
    expect(api.sendMessage).toHaveBeenCalledWith({
      clientRequestId: 'client-request-id',
      conversationId: 'conversation-1',
      body: 'hello there',
    });
    expect(output.out.join('')).toContain('Sent message-1.');
  });

  it('refuses to send into an end-to-end encrypted conversation and points at the app path', async () => {
    const api = fakeApi();
    const output = io();
    const e2eeConversation = create(ConversationSchema, {
      ...conversation(),
      securityMode: CONVERSATION_SECURITY_MODE.E2EE_V1,
    });
    api.getConversation.mockResolvedValue(
      create(GetConversationResponseSchema, { conversation: e2eeConversation }),
    );

    const exitCode = await runDm(['send', 'conversation-1', 'hello'], deps(api, output));

    expect(exitCode).toBe(1);
    expect(api.sendMessage).not.toHaveBeenCalled();
    // Worded to stay inside §194's scanner: the banned words apply to the LEGACY surface,
    // but this refusal lives on that same file, so it describes the mode without the
    // word "encrypted" (the proto doc reserves it for E2EE-mode screens).
    expect(output.err.join('')).toContain('end-to-end encryption');
    expect(output.err.join('')).toContain('interactive app');
  });

  it('still sends when the conversation lookup comes back empty, letting the server answer', async () => {
    const api = fakeApi();
    const output = io();
    api.getConversation.mockResolvedValue(create(GetConversationResponseSchema, {}));

    const exitCode = await runDm(['send', 'conversation-1', 'hello'], deps(api, output));

    expect(exitCode).toBe(0);
    expect(api.sendMessage).toHaveBeenCalled();
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
    api.listMessages.mockResolvedValue(
      create(ListMessagesResponseSchema, {
        messages: [message('newest', `new\x1b[2J`), message('older', 'old')],
        page: makePageInfo({ nextCursor: 'older-cursor', hasMore: true }),
      }),
    );

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
    api.listMessageRequests.mockResolvedValue(
      create(ListMessageRequestsResponseSchema, {
        requests: [request('request-1', `hello\x1b[H`)],
      }),
    );

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
