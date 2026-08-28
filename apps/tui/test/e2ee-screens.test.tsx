import { create } from '@bufbuild/protobuf';
import { GetConversationResponseSchema, ListConversationsResponseSchema } from '@patches/proto/es';
import type { Conversation } from '../src/api/wire/types.js';
import { CONVERSATION_SECURITY_MODE } from '../src/api/wire/enums.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from './ansi.js';
import { E2eeNotEnrolledError } from '../src/e2ee/runtime.js';
import type { InboxRow as E2eeReceivedRow } from '../src/e2ee/runtime.js';
import {
  MessagesScreen,
  unverifiableMessageCopy,
  type MessagesScreenApi,
} from '../src/screens/MessagesScreen.js';
import { makeConversation, makeConversationMember, makeActor } from '../src/test/wire-fixtures.js';

const KEY = { enter: '\r' } as const;

function actor(id: string, handle: string): ReturnType<typeof makeActor> {
  return makeActor({ id, handle, displayName: '' });
}

const peer = actor('actor-peer', 'peer');

function e2eeConversation(id: string): Conversation {
  return makeConversation({
    id,
    createdBy: peer,
    securityMode: CONVERSATION_SECURITY_MODE.E2EE_V1,
    members: [makeConversationMember({ actor: peer })],
  });
}

function fakeApi(conversation: Conversation): MessagesScreenApi {
  return {
    listConversations: vi
      .fn()
      .mockResolvedValue(
        create(ListConversationsResponseSchema, { conversations: [conversation] }),
      ),
    getConversation: vi
      .fn()
      .mockResolvedValue(create(GetConversationResponseSchema, { conversation })),
    markConversationRead: vi.fn().mockResolvedValue({}),
  };
}

async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<string> {
  const deadline = Date.now() + 2_000;
  let frame = stripSgr(lastFrame() ?? '');
  while (!frame.includes(text)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${text}. Last frame:\n${frame}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    frame = stripSgr(lastFrame() ?? '');
  }
  return frame;
}

describe('MessagesScreen end-to-end seams (B-101)', () => {
  it('renders decrypted mailbox rows and dedupes repeats across polls', async () => {
    const conv = e2eeConversation('conv-e2ee');
    const api = fakeApi(conv);
    const row: E2eeReceivedRow = {
      kind: 'message',
      id: 'env-1',
      senderLabel: '@actor-peer',
      body: 'hello from the vault',
      sentByViewer: false,
    };
    const receiveE2ee = vi.fn<(conversationId: string) => Promise<readonly E2eeReceivedRow[]>>();
    receiveE2ee.mockResolvedValue([row]);

    const { lastFrame, stdin } = render(
      <MessagesScreen api={api} isActive receiveE2ee={receiveE2ee} mailPollMs={50} />,
    );
    await waitForFrame(lastFrame, '[E2EE]');
    stdin.write(KEY.enter);
    const frame = await waitForFrame(lastFrame, 'hello from the vault');
    expect(frame).toContain('[E2EE]');
    expect(frame).toContain('@actor-peer:');

    // A second poll delivering the same envelope id must not duplicate the row.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const settled = stripSgr(lastFrame() ?? '');
    expect(settled.split('hello from the vault').length - 1).toBe(1);
    expect(receiveE2ee).toHaveBeenCalledWith('conv-e2ee');
  });

  it("renders ADR 0025 §4's neutral placeholder for franking failures", async () => {
    const conv = e2eeConversation('conv-e2ee');
    const api = fakeApi(conv);
    const rows: E2eeReceivedRow[] = [
      { kind: 'unverifiable', id: 'env-bad', senderLabel: '@actor-peer' },
    ];
    const receiveE2ee = vi.fn<(conversationId: string) => Promise<readonly E2eeReceivedRow[]>>();
    receiveE2ee.mockResolvedValue(rows);

    const { lastFrame, stdin } = render(
      <MessagesScreen api={api} isActive receiveE2ee={receiveE2ee} />,
    );
    await waitForFrame(lastFrame, '[E2EE]');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, unverifiableMessageCopy('@actor-peer'));
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).not.toContain('hello');
  });

  it('labels re-delivered history with its provenance', async () => {
    const conv = e2eeConversation('conv-e2ee');
    const api = fakeApi(conv);
    const rows: E2eeReceivedRow[] = [
      {
        kind: 'history',
        id: 'env-hist',
        fromLabel: '@actor-peer',
        entries: [{ senderLabel: '@actor-peer', body: 'an older message' }],
      },
    ];
    const receiveE2ee = vi.fn<(conversationId: string) => Promise<readonly E2eeReceivedRow[]>>();
    receiveE2ee.mockResolvedValue(rows);

    const { lastFrame, stdin } = render(
      <MessagesScreen api={api} isActive receiveE2ee={receiveE2ee} />,
    );
    await waitForFrame(lastFrame, '[E2EE]');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'Re-delivered history from @actor-peer');
    expect(stripSgr(lastFrame() ?? '')).toContain('provenance');
    expect(stripSgr(lastFrame() ?? '')).toContain('an older message');
  });

  it('shows signature-verdict lines when the transcript comes back verified', async () => {
    const conv = e2eeConversation('conv-g');
    const api = fakeApi(conv);
    const verify = vi.fn<
      (request: { conversationId: string }) => Promise<{
        allVerified: boolean;
        rows: readonly {
          epoch: bigint;
          change: 'ADDED';
          subjectActorId: string;
          signatureVerified: boolean;
        }[];
      }>
    >();
    verify.mockResolvedValue({
      allVerified: true,
      rows: [{ epoch: 2n, change: 'ADDED', subjectActorId: 'actor-new', signatureVerified: true }],
    });
    api.verifyGroupControlEvents = verify;

    const { lastFrame, stdin } = render(<MessagesScreen api={api} isActive />);
    await waitForFrame(lastFrame, '[E2EE]');
    // G opens the membership transcript at the list level.
    stdin.write('G');
    await new Promise((r) => setTimeout(r, 50));
    await waitForFrame(lastFrame, 'Membership changes');
    await waitForFrame(lastFrame, 'signature verified');
    expect(verify.mock.calls).toEqual([[{ conversationId: 'conv-g' }]]);
  });

  it('maps an unenrolled send failure to the enrolled-device copy, not "message lost"', async () => {
    const conv = e2eeConversation('conv-e2ee');
    const api = fakeApi(conv);
    const sendE2ee =
      vi.fn<(conversationId: string, body: string) => Promise<E2eeReceivedRow | undefined>>();
    sendE2ee.mockRejectedValue(new E2eeNotEnrolledError());

    const { lastFrame, stdin } = render(
      <MessagesScreen api={api} isActive sendE2ee={sendE2ee} createRequestId={() => 'rid'} />,
    );
    await waitForFrame(lastFrame, '[E2EE]');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'Draft:');
    stdin.write('hi');
    await waitForFrame(lastFrame, 'Draft: hi');
    stdin.write(KEY.enter);

    await waitForFrame(lastFrame, 'needs an enrolled device');
    expect(stripSgr(lastFrame() ?? '')).toContain('Your draft is kept');
  });
});
