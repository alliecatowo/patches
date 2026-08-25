import { readFile } from 'node:fs/promises';

import { create } from '@bufbuild/protobuf';
import { GetConversationResponseSchema, ListConversationsResponseSchema } from '@patches/proto/es';
import type { Actor, Conversation } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import {
  MessagesScreen,
  UNREVIEWED_DEV_E2EE_WARNING,
  VAULT_FAULT_COPY,
  type MessagesScreenApi,
} from './MessagesScreen.js';
import { makeActor, makeConversation, makeConversationMember, makePageInfo } from '../test/wire-fixtures.js';

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
});
