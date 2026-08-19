import { readFile } from 'node:fs/promises';

import {
  CONVERSATION_KIND,
  MESSAGE_REQUEST_STATUS,
  type Actor,
  type Conversation,
  type Message,
  type MessageRequest,
} from '@patches/proto';
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
