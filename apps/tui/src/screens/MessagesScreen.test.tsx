import { readFile } from 'node:fs/promises';

import { CONVERSATION_KIND, MESSAGE_REQUEST_STATUS } from '../api/wire/enums.js';
import type {
  Actor,
  Conversation,
  ConversationSecurityMode,
  Message,
  MessageRequest,
} from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { DM_DISCLOSURE, MessagesScreen, type MessagesScreenApi } from './MessagesScreen.js';

const KEY = { enter: '\r', escape: '\x1b' } as const;

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

function conversation(id: string, peer = alice): Conversation {
  return {
    id,
    kind: CONVERSATION_KIND.DIRECT,
    createdBy: alice,
    members: [
      {
        actor: peer,
        joinedAt: undefined,
        leftAt: undefined,
        lastReadMessageId: '',
        muted: false,
      },
    ],
    createdAt: undefined,
    lastMessageAt: undefined,
    unreadCount: 0,
    // Every v0 conversation this screen renders is server-visible (ADR 0017) —
    // `CONVERSATION_SECURITY_MODE_E2EE_V1` conversations are a different feature's
    // concurrent WIP on this branch (`E2eeService`) and don't yet reach this screen.
    securityMode: 'CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE' as ConversationSecurityMode,
  };
}

function message(id: string, body: string, sender = alice): Message {
  return {
    id,
    conversationId: 'conversation-1',
    sender,
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

interface FakeApi extends MessagesScreenApi {
  listConversations: ReturnType<typeof vi.fn<MessagesScreenApi['listConversations']>>;
  getConversation: ReturnType<typeof vi.fn<MessagesScreenApi['getConversation']>>;
  listMessages: ReturnType<typeof vi.fn<MessagesScreenApi['listMessages']>>;
  sendMessage: ReturnType<typeof vi.fn<MessagesScreenApi['sendMessage']>>;
  markConversationRead: ReturnType<typeof vi.fn<MessagesScreenApi['markConversationRead']>>;
  listMessageRequests: ReturnType<typeof vi.fn<MessagesScreenApi['listMessageRequests']>>;
  respondToMessageRequest: ReturnType<typeof vi.fn<MessagesScreenApi['respondToMessageRequest']>>;
}

function fakeApi(): FakeApi {
  return {
    listConversations: vi.fn().mockResolvedValue({ conversations: [], page: undefined }),
    getConversation: vi.fn().mockResolvedValue({ conversation: undefined }),
    listMessages: vi.fn().mockResolvedValue({ messages: [], page: undefined }),
    sendMessage: vi.fn().mockResolvedValue({ message: undefined }),
    markConversationRead: vi.fn().mockResolvedValue({}),
    listMessageRequests: vi.fn().mockResolvedValue({ requests: [], page: undefined }),
    respondToMessageRequest: vi
      .fn()
      .mockResolvedValue({ request: undefined, conversation: undefined }),
  };
}

/** Frames carry SGR colour (see `vitest.config.ts`), so match on characters. */
async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<string> {
  const deadline = Date.now() + 2_000;
  let frame = stripSgr(lastFrame() ?? '');
  while (!frame.includes(text)) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${text}. Last frame:\n${frame}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    frame = stripSgr(lastFrame() ?? '');
  }
  return frame;
}

describe('MessagesScreen', () => {
  it('keeps the disclosure on the first row and has no prohibited DM descriptors', async () => {
    const api = fakeApi();
    const { lastFrame } = render(<MessagesScreen api={api} isActive />);
    const frame = await waitForFrame(lastFrame, 'No conversations yet.');

    expect(frame.split('\n')[0]).toBe(DM_DISCLOSURE);

    const sources = await Promise.all([
      readFile(new URL('./MessagesScreen.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../cli/dm.ts', import.meta.url), 'utf8'),
    ]);
    for (const source of sources) {
      const withoutDisclosure = source.replaceAll(DM_DISCLOSURE, '');
      expect(withoutDisclosure).not.toMatch(/\b(?:encrypted|secure|private)\b/i);
    }
  });

  it('uses opaque cursors and navigates list to thread to requests with Esc back', async () => {
    const api = fakeApi();
    const hostilePeer = actor('peer-1', `mallory\x1b[2J`, 'Mal\x07lory');
    const first = conversation('conversation-1', hostilePeer);
    const second = conversation('conversation-2', actor('peer-2', 'bob', 'Bob'));
    api.listConversations.mockImplementation(({ cursor }) =>
      Promise.resolve(
        cursor === ''
          ? { conversations: [first], page: { nextCursor: 'opaque-next', hasMore: true } }
          : { conversations: [second], page: { nextCursor: '', hasMore: false } },
      ),
    );
    api.getConversation.mockResolvedValue({ conversation: first });
    api.listMessages.mockResolvedValue({
      messages: [message('message-1', `hello\x1b[Hthere`, hostilePeer)],
      page: { nextCursor: '', hasMore: false },
    });
    api.listMessageRequests.mockResolvedValue({
      requests: [request('request-1', `please\x1b[2J reply`)],
      page: { nextCursor: '', hasMore: false },
    });

    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    await waitForFrame(lastFrame, '@mallory[2J');

    stdin.write('n');
    await waitForFrame(lastFrame, '@bob');
    expect(api.listConversations).toHaveBeenLastCalledWith({ cursor: 'opaque-next', limit: 20 });

    stdin.write(KEY.enter);
    const thread = await waitForFrame(lastFrame, 'hello[Hthere');
    expect(thread).not.toContain('\x1b[H');
    expect(api.markConversationRead).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      throughMessageId: 'message-1',
    });

    stdin.write(KEY.escape);
    await waitForFrame(lastFrame, 'r requests');
    stdin.write('r');
    const requests = await waitForFrame(lastFrame, 'please[2J reply');
    expect(requests).toContain('Message requests');

    stdin.write(KEY.escape);
    await waitForFrame(lastFrame, 'r requests');
  });

  it('renders an optimistic send and restores the draft when sending fails', async () => {
    const api = fakeApi();
    const existing = conversation('conversation-1');
    api.listConversations.mockResolvedValue({ conversations: [existing], page: undefined });
    api.getConversation.mockResolvedValue({ conversation: existing });

    let rejectSend: ((reason: Error) => void) | undefined;
    api.sendMessage.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSend = reject;
        }),
    );

    const { lastFrame, stdin } = render(
      <MessagesScreen api={api} isActive createRequestId={() => 'request-id'} />,
    );
    await waitForFrame(lastFrame, '@alice');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'Draft:');
    stdin.write('hello');
    await waitForFrame(lastFrame, 'Draft: hello');
    stdin.write(KEY.enter);

    await waitForFrame(lastFrame, 'hello · sending');
    expect(api.sendMessage).toHaveBeenCalledWith({
      clientRequestId: 'request-id',
      conversationId: 'conversation-1',
      body: 'hello',
    });

    rejectSend?.(new Error('network failed'));
    const failed = await waitForFrame(lastFrame, 'Message was not sent. Your draft is still here.');
    expect(failed).toContain('Draft: hello');
    expect(failed).not.toContain('hello · sending');
  });

  it('shows an Inbox/Requests folder strip and switches with Tab (P12-114)', async () => {
    const api = fakeApi();
    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    await waitForFrame(lastFrame, 'No conversations yet.');
    expect(stripSgr(lastFrame() ?? '')).toContain('Inbox');
    expect(stripSgr(lastFrame() ?? '')).toContain('Requests');

    stdin.write('\t');
    await waitForFrame(lastFrame, 'No pending requests.');

    stdin.write('\t');
    await waitForFrame(lastFrame, 'No conversations yet.');
  });

  it('shows a pending glyph on an optimistic send', async () => {
    const api = fakeApi();
    const existing = conversation('conversation-1');
    api.listConversations.mockResolvedValue({ conversations: [existing], page: undefined });
    api.getConversation.mockResolvedValue({ conversation: existing });
    api.sendMessage.mockImplementation(() => new Promise(() => undefined));

    const { lastFrame, stdin } = render(
      <MessagesScreen api={api} isActive createRequestId={() => 'request-id'} />,
    );
    await waitForFrame(lastFrame, '@alice');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'Draft:');
    stdin.write('hi');
    await waitForFrame(lastFrame, 'Draft: hi');
    stdin.write(KEY.enter);
    const frame = await waitForFrame(lastFrame, 'hi · sending');
    expect(frame).toContain('◌ you:');
  });

  it('renders node-policy retention copy when the caller supplies it, and nothing when it has not fetched it yet', async () => {
    const api = fakeApi();
    const { lastFrame, rerender } = render(
      <MessagesScreen api={api} isActive dmRetentionDays={30} />,
    );
    const frame = await waitForFrame(lastFrame, 'No conversations yet.');
    expect(frame).toContain('This node automatically deletes messages older than 30 days.');

    rerender(<MessagesScreen api={api} isActive dmRetentionDays={0} />);
    const unlimited = await waitForFrame(lastFrame, 'No conversations yet.');
    expect(unlimited).toContain('enforce no automatic deletion window');

    rerender(<MessagesScreen api={api} isActive />);
    const withoutPolicy = await waitForFrame(lastFrame, 'No conversations yet.');
    expect(withoutPolicy).not.toContain('automatic deletion');
    expect(withoutPolicy).not.toContain('automatically deletes');
  });

  it('accepts and declines selected requests without exposing transport details', async () => {
    const api = fakeApi();
    api.listMessageRequests.mockResolvedValue({
      requests: [request('request-1', 'one'), request('request-2', 'two')],
      page: undefined,
    });

    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    await waitForFrame(lastFrame, 'No conversations yet.');
    stdin.write('r');
    await waitForFrame(lastFrame, 'one');
    stdin.write('a');
    await waitForFrame(lastFrame, 'Request accepted.');
    expect(api.respondToMessageRequest).toHaveBeenCalledWith({ id: 'request-1', accept: true });

    stdin.write('d');
    await waitForFrame(lastFrame, 'Request declined.');
    expect(api.respondToMessageRequest).toHaveBeenCalledWith({ id: 'request-2', accept: false });
  });
});
