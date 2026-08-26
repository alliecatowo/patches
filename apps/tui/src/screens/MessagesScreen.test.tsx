import { readFile } from 'node:fs/promises';

import { create } from '@bufbuild/protobuf';
import { GetConversationResponseSchema, ListConversationsResponseSchema } from '@patches/proto/es';
import type { Actor, Conversation } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { flush } from '../../test/harness.js';
import {
  dmFreshnessCopy,
  MessagesScreen,
  UNREVIEWED_DEV_E2EE_WARNING,
  VAULT_FAULT_COPY,
  type MessagesScreenApi,
} from './MessagesScreen.js';
import { TUI_CONVERSATION_LIST_POLL_MS, TUI_THREAD_MAIL_POLL_MS } from '../app/poll-intervals.js';
import {
  makeActor,
  makeConversation,
  makeConversationMember,
  makePageInfo,
} from '../test/wire-fixtures.js';

const KEY = { enter: '\r', escape: '\x1b' } as const;

function actor(id: string, handle: string, displayName: string): Actor {
  return makeActor({ id, handle, displayName });
}

const alice = actor('actor-alice', 'alice', 'Alice');

/** B-095/ADR 0030 retired `LEGACY_SERVER_VISIBLE`: every conversation this screen can
 * reach is `E2EE_V1` — `makeConversation`'s default already reflects that. */
function conversation(id: string, peer = alice): Conversation {
  return makeConversation({
    id,
    createdBy: alice,
    members: [makeConversationMember({ actor: peer })],
  });
}

interface FakeApi extends MessagesScreenApi {
  listConversations: ReturnType<typeof vi.fn<MessagesScreenApi['listConversations']>>;
  getConversation: ReturnType<typeof vi.fn<MessagesScreenApi['getConversation']>>;
  markConversationRead: ReturnType<typeof vi.fn<MessagesScreenApi['markConversationRead']>>;
}

function fakeApi(): FakeApi {
  return {
    listConversations: vi.fn().mockResolvedValue({ conversations: [], page: undefined }),
    getConversation: vi.fn().mockResolvedValue({ conversation: undefined }),
    markConversationRead: vi.fn().mockResolvedValue({}),
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

/** Polls a predicate rather than a frame, same bounded-wait shape as `waitForFrame`. */
async function waitForCondition(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('MessagesScreen', () => {
  it(
    'renders no legacy server-visible disclosure and stays inside the accurate-language ' +
      'rule (B-096: §194 now bans "encrypted"/"secure"/"private" everywhere they would ' +
      'overclaim, but every conversation is genuinely E2EE_V1, so the fixed E2EE-mode ' +
      'copy naming that fact is the one deliberate exception)',
    async () => {
      const api = fakeApi();
      const { lastFrame } = render(<MessagesScreen api={api} isActive />);
      const frame = await waitForFrame(lastFrame, 'No conversations yet.');

      // The retired legacy notice ("Not end-to-end encrypted — this node's operators can
      // read these messages") must not appear anywhere — it would now be false, since no
      // server-visible conversation can exist any more.
      expect(frame).not.toContain("this node's operators can read these messages");

      const sources = await Promise.all([
        readFile(new URL('./MessagesScreen.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../cli/dm.ts', import.meta.url), 'utf8'),
      ]);
      for (const source of sources) {
        // Every remaining conversation is genuinely `E2EE_V1` (ADR 0030/B-095), so the
        // banned words are legitimate in the small set of fixed strings that state that
        // fact plainly. Stripping them before scanning keeps the rest of both files
        // honest: nothing outside these named exceptions may claim encryption/security/
        // privacy that isn't backed by `mayDescribeAsEndToEndEncrypted`.
        const withoutE2eeCopy = source
          .replaceAll(UNREVIEWED_DEV_E2EE_WARNING, '')
          .replaceAll(VAULT_FAULT_COPY.corrupt, '')
          .replaceAll(VAULT_FAULT_COPY.rollback, '')
          // `cli/dm.ts`'s `DM_NOTICE`/`E2EE_REFUSAL` mirror
          // `requiredConversationDisclosure('E2EE_V1')` from `@patches/domain` rather than
          // importing it (kept for a small CLI dependency surface) — strip by content,
          // not by importing the constant, so this test also catches the mirror drifting.
          .replaceAll(
            'End-to-end encrypted. This node cannot read these messages, but it can see who you message and when.',
            '',
          );
        expect(withoutE2eeCopy).not.toMatch(/\b(?:encrypted|secure|private)\b/i);
      }
    },
  );

  it('uses opaque cursors and navigates list to thread with Esc back', async () => {
    const api = fakeApi();
    const hostilePeer = actor('peer-1', `mallory\x1b[2J`, 'Mal\x07lory');
    const first = conversation('conversation-1', hostilePeer);
    const second = conversation('conversation-2', actor('peer-2', 'bob', 'Bob'));
    api.listConversations.mockImplementation(({ cursor }) =>
      Promise.resolve(
        cursor === ''
          ? create(ListConversationsResponseSchema, {
              conversations: [first],
              page: makePageInfo({ nextCursor: 'opaque-next', hasMore: true }),
            })
          : create(ListConversationsResponseSchema, {
              conversations: [second],
              page: makePageInfo(),
            }),
      ),
    );
    api.getConversation.mockResolvedValue(
      create(GetConversationResponseSchema, { conversation: first }),
    );

    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    await waitForFrame(lastFrame, '@mallory[2J');

    stdin.write('n');
    await waitForFrame(lastFrame, '@bob');
    expect(api.listConversations).toHaveBeenLastCalledWith({ cursor: 'opaque-next', limit: 20 });

    stdin.write(KEY.enter);
    const thread = await waitForFrame(lastFrame, '[E2EE]');
    expect(thread).not.toContain('\x1b[H');

    stdin.write(KEY.escape);
    await waitForFrame(lastFrame, '@mallory[2J');
  });

  it('refuses to send without a vault-backed pipeline, rather than falling back to a plaintext RPC', async () => {
    const api = fakeApi();
    const existing = conversation('conversation-1');
    api.listConversations.mockResolvedValue(
      create(ListConversationsResponseSchema, { conversations: [existing] }),
    );
    api.getConversation.mockResolvedValue(
      create(GetConversationResponseSchema, { conversation: existing }),
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

    const failed = await waitForFrame(lastFrame, 'needs an enrolled device');
    expect(failed).toContain('Draft: hello');
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

  it(
    'marks a conversation read exactly once on open, clears its badge locally, and does ' +
      'not re-fire on reopen/re-render (P19-018)',
    async () => {
      const api = fakeApi();
      const existing = conversation('conversation-1');
      api.listConversations.mockResolvedValue(
        create(ListConversationsResponseSchema, {
          conversations: [{ ...existing, unreadCount: 3 }],
        }),
      );
      api.getConversation.mockResolvedValue(
        create(GetConversationResponseSchema, { conversation: existing }),
      );
      const onReadStateChanged = vi.fn();

      const { lastFrame, stdin, rerender } = render(
        <MessagesScreen api={api} isActive onReadStateChanged={onReadStateChanged} />,
      );
      const list = await waitForFrame(lastFrame, '3 unread');
      expect(list).toContain('@alice');
      expect(api.markConversationRead).not.toHaveBeenCalled();

      stdin.write(KEY.enter);
      await waitForFrame(lastFrame, '[E2EE]');
      expect(api.markConversationRead).toHaveBeenCalledTimes(1);
      expect(api.markConversationRead).toHaveBeenCalledWith({
        conversationId: 'conversation-1',
        throughMessageId: '',
      });

      // A re-render while the same thread stays open must not re-fire the RPC — only
      // opening a (new) conversation id does.
      rerender(<MessagesScreen api={api} isActive onReadStateChanged={onReadStateChanged} />);
      await waitForFrame(lastFrame, '[E2EE]');
      expect(api.markConversationRead).toHaveBeenCalledTimes(1);
      expect(onReadStateChanged).toHaveBeenCalledTimes(1);

      // Target text unique to the settled *list* view — the thread header also
      // contains "@alice" (inside "Alice (@alice) [E2EE]"), so waiting on that alone
      // would resolve instantly on the stale pre-Escape frame.
      stdin.write(KEY.escape);
      const back = await waitForFrame(lastFrame, 'Enter open');
      // The badge clears locally without waiting for a refetch.
      expect(back).not.toContain('unread');

      // Reopening the same conversation marks it read again (a second open is a new
      // "opened this thread" event, e.g. after new messages arrived).
      stdin.write(KEY.enter);
      await waitForFrame(lastFrame, '[E2EE]');
      expect(api.markConversationRead).toHaveBeenCalledTimes(2);
      // `onReadStateChanged` fires from the mark-read promise's `.then`, which the
      // frame condition above does not wait on — give it a tick to settle (documented
      // hazard: a resolved `waitForFrame` doesn't imply a still-pending microtask ran).
      await flush();
      expect(onReadStateChanged).toHaveBeenCalledTimes(2);
    },
  );

  it('does not clear a conversation badge locally when marking it read fails (P19-018)', async () => {
    const api = fakeApi();
    const existing = conversation('conversation-1');
    api.listConversations.mockResolvedValue(
      create(ListConversationsResponseSchema, {
        conversations: [{ ...existing, unreadCount: 3 }],
      }),
    );
    api.getConversation.mockResolvedValue(
      create(GetConversationResponseSchema, { conversation: existing }),
    );
    api.markConversationRead.mockRejectedValue(new Error('unavailable'));

    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    await waitForFrame(lastFrame, '3 unread');

    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, '[E2EE]');
    expect(api.markConversationRead).toHaveBeenCalledTimes(1);

    stdin.write(KEY.escape);
    const back = await waitForFrame(lastFrame, 'Enter open');
    // The server still believes this is unread — the badge must keep saying so, never
    // fake a local zero over a failed mark-read.
    expect(back).toContain('3 unread');
  });

  it(
    'refreshes the conversation list on conversationListPollMs while it is the open, ' +
      'active screen (P19-017, ADR 0032)',
    async () => {
      const api = fakeApi();
      api.listConversations.mockResolvedValue(
        create(ListConversationsResponseSchema, { conversations: [] }),
      );
      const { lastFrame } = render(
        <MessagesScreen api={api} isActive conversationListPollMs={20} />,
      );
      await waitForFrame(lastFrame, 'No conversations yet.');
      const initialCalls = api.listConversations.mock.calls.length;
      await waitForCondition(
        () => api.listConversations.mock.calls.length > initialCalls,
        'a second conversation-list poll',
      );
    },
  );

  it('stops polling the conversation list once the screen is no longer active', async () => {
    const api = fakeApi();
    api.listConversations.mockResolvedValue(
      create(ListConversationsResponseSchema, { conversations: [] }),
    );
    const { lastFrame, rerender } = render(
      <MessagesScreen api={api} isActive conversationListPollMs={20} />,
    );
    await waitForFrame(lastFrame, 'No conversations yet.');

    rerender(<MessagesScreen api={api} isActive={false} conversationListPollMs={20} />);
    const callsAtInactive = api.listConversations.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(api.listConversations.mock.calls.length).toBe(callsAtInactive);
  });

  it(
    'a failed background list refresh keeps the last-known conversations and states the ' +
      'failure — it is never mistaken for "No conversations yet." (P19-017)',
    async () => {
      const api = fakeApi();
      const existing = conversation('conversation-1');
      api.listConversations.mockResolvedValueOnce(
        create(ListConversationsResponseSchema, { conversations: [existing] }),
      );
      const { lastFrame } = render(
        <MessagesScreen api={api} isActive conversationListPollMs={20} />,
      );
      await waitForFrame(lastFrame, '@alice');

      api.listConversations.mockRejectedValueOnce(new Error('network down'));
      const frame = await waitForFrame(lastFrame, 'Could not load conversations.');
      expect(frame).toContain('@alice');
      expect(frame).not.toContain('No conversations yet.');
    },
  );

  it(
    "P19-016: bumping refreshToken (the shell's Ctrl+R) refetches the conversation list " +
      'on top of its normal poll, without a second binding',
    async () => {
      const api = fakeApi();
      api.listConversations.mockResolvedValue(
        create(ListConversationsResponseSchema, { conversations: [] }),
      );
      // A poll interval long enough that only the manual refresh should fire a second
      // call inside the test's timeout.
      const { lastFrame, rerender } = render(
        <MessagesScreen api={api} isActive conversationListPollMs={60_000} refreshToken={0} />,
      );
      await waitForFrame(lastFrame, 'No conversations yet.');
      const initialCalls = api.listConversations.mock.calls.length;

      rerender(
        <MessagesScreen api={api} isActive conversationListPollMs={60_000} refreshToken={1} />,
      );
      await waitForCondition(
        () => api.listConversations.mock.calls.length > initialCalls,
        'a Ctrl+R-triggered conversation-list refetch',
      );
    },
  );

  it(
    'P19-016: bumping refreshToken while a thread is open refetches the conversation ' +
      'and re-drains the end-to-end mailbox',
    async () => {
      const api = fakeApi();
      const existing = conversation('conversation-1');
      api.listConversations.mockResolvedValue(
        create(ListConversationsResponseSchema, { conversations: [existing] }),
      );
      api.getConversation.mockResolvedValue(
        create(GetConversationResponseSchema, { conversation: existing }),
      );
      const receiveE2ee = vi.fn().mockResolvedValue([]);

      const { lastFrame, stdin, rerender } = render(
        <MessagesScreen api={api} isActive receiveE2ee={receiveE2ee} refreshToken={0} />,
      );
      await waitForFrame(lastFrame, '@alice');
      stdin.write(KEY.enter);
      await waitForFrame(lastFrame, '[E2EE]');

      const conversationCallsBefore = api.getConversation.mock.calls.length;
      const mailboxCallsBefore = receiveE2ee.mock.calls.length;

      rerender(<MessagesScreen api={api} isActive receiveE2ee={receiveE2ee} refreshToken={1} />);
      await waitForCondition(
        () => api.getConversation.mock.calls.length > conversationCallsBefore,
        'a Ctrl+R-triggered conversation refetch',
      );
      await waitForCondition(
        () => receiveE2ee.mock.calls.length > mailboxCallsBefore,
        'a Ctrl+R-triggered mailbox drain',
      );
    },
  );

  it('states the DM freshness SLA on both surfaces, tied to the ADR 0032 constants', async () => {
    const api = fakeApi();
    const existing = conversation('conversation-1');
    api.listConversations.mockResolvedValue(
      create(ListConversationsResponseSchema, { conversations: [existing] }),
    );
    api.getConversation.mockResolvedValue(
      create(GetConversationResponseSchema, { conversation: existing }),
    );

    // Ink wraps a long `Text` across frame rows, so compare against the
    // newline-collapsed frame rather than a literal substring match.
    const oneLine = (frame: string): string =>
      frame.replaceAll('\n', ' ').replaceAll(/ {2,}/g, ' ');

    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    const list = oneLine(await waitForFrame(lastFrame, '@alice'));
    expect(list).toContain(dmFreshnessCopy('list', TUI_CONVERSATION_LIST_POLL_MS));
    expect(list).toContain('Nothing arrives while this client is closed.');

    // "[E2EE]" alone is already present on the *list* row (every conversation here is
    // E2EE), so waiting on it would resolve on the stale pre-Enter frame — "Draft:"
    // only exists once the thread view has actually rendered.
    stdin.write(KEY.enter);
    const thread = oneLine(await waitForFrame(lastFrame, 'Draft:'));
    expect(thread).toContain(dmFreshnessCopy('thread', TUI_THREAD_MAIL_POLL_MS));
    expect(thread).toContain('Nothing arrives while this client is closed.');
  });

  it('never implies push, live, instant, or realtime delivery in the freshness copy itself', () => {
    const forbidden = /\blive\b|\binstant(ly)?\b|\brealtime\b|push notification/i;
    expect(dmFreshnessCopy('list', TUI_CONVERSATION_LIST_POLL_MS)).not.toMatch(forbidden);
    expect(dmFreshnessCopy('thread', TUI_THREAD_MAIL_POLL_MS)).not.toMatch(forbidden);
  });
});
