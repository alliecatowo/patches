import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  Conversation,
  ConversationMember,
  Message,
  MessageRequest,
  Notification,
  Report,
} from '@patches/database';
import {
  CONVERSATION_KIND,
  createAuthClient,
  createDirectMessageClient,
  createModerationClient,
  MESSAGE_REQUEST_STATUS,
  REPORT_REASON,
  type AuthGrpcClient,
  type CreateConversationRequest,
  type CreateConversationResponse,
  type DeleteMessageRequest,
  type DeleteMessageResponse,
  type DirectMessageGrpcClient,
  type GetConversationRequest,
  type GetConversationResponse,
  type MarkConversationReadRequest,
  type MarkConversationReadResponse,
  type ModerationGrpcClient,
  type ReportMessageRequest,
  type ReportMessageResponse,
  type RespondToMessageRequestRequest,
  type RespondToMessageRequestResponse,
  type SendMessageRequest,
  type SendMessageResponse,
} from '@patches/proto';
import { createTestBlock, createTestFollow, createTestUser } from '@patches/testkit';
import { IsNull, type DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping Phase 11 messages integration tests: TEST_DATABASE_URL is not ' +
      'set (start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'Phase 11 direct messages over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let messages: DirectMessageGrpcClient;
    let moderation: ModerationGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      messages = createDirectMessageClient(server.url, grpcCredentials.createInsecure());
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      messages.close();
      moderation.close();
      await server.close();
      await dataSource.destroy();
    });

    async function newActor(displayName?: string): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId, {
        ...(displayName === undefined ? {} : { displayName }),
      });
    }

    async function send(
      sender: TestActor,
      conversationId: string,
      body: string,
    ): Promise<NonNullable<SendMessageResponse['message']>> {
      const response = await callUnary<SendMessageRequest, SendMessageResponse>(
        messages.sendMessage.bind(messages),
        { clientRequestId: randomUUID(), conversationId, body },
        { accessToken: sender.accessToken },
      );
      expect(response.message).toBeDefined();
      return response.message!;
    }

    it('gates a non-mutual DM through one request, accepts it, and enforces viewer-scoped reads, tombstones, reports, and block no-oracle behavior', async () => {
      const alice = await newActor('Alice');
      const bob = await newActor('Bob');
      const requestBody = `request-${testSuffix()}`;

      const created = await callUnary<CreateConversationRequest, CreateConversationResponse>(
        messages.createConversation.bind(messages),
        {
          clientRequestId: randomUUID(),
          recipientActorIds: [bob.actorId],
          initialBody: requestBody,
        },
        { accessToken: alice.accessToken },
      );

      expect(created.conversation).toBeNull();
      expect(created.request?.status).toBe(MESSAGE_REQUEST_STATUS.PENDING);
      expect(created.request?.body).toBe(requestBody);

      const requestId = created.request?.id ?? '';
      expect(requestId).not.toBe('');
      expect(
        await dataSource.getRepository(MessageRequest).count({
          where: { senderActorId: alice.actorId, recipientActorId: bob.actorId },
        }),
      ).toBe(1);
      expect(
        await dataSource.getRepository(Notification).count({
          where: {
            recipientActorId: bob.actorId,
            actorId: alice.actorId,
            type: 'MESSAGE',
            conversationId: IsNull(),
          },
        }),
      ).toBe(1);

      const accepted = await callUnary<
        RespondToMessageRequestRequest,
        RespondToMessageRequestResponse
      >(
        messages.respondToMessageRequest.bind(messages),
        { id: requestId, accept: true },
        { accessToken: bob.accessToken },
      );

      expect(accepted.request?.status).toBe(MESSAGE_REQUEST_STATUS.ACCEPTED);
      expect(accepted.request?.body).toBe('');
      expect(accepted.conversation?.kind).toBe(CONVERSATION_KIND.DIRECT);
      const conversationId = accepted.conversation?.id ?? '';
      expect(conversationId).not.toBe('');

      const storedRequest = await dataSource.getRepository(MessageRequest).findOneByOrFail({
        id: requestId,
      });
      expect(storedRequest.status).toBe('ACCEPTED');
      expect(storedRequest.body).toBe('');
      expect(
        await dataSource.getRepository(Conversation).count({ where: { id: conversationId } }),
      ).toBe(1);
      expect(
        await dataSource.getRepository(ConversationMember).count({ where: { conversationId } }),
      ).toBe(2);
      expect(await dataSource.getRepository(Message).count({ where: { conversationId } })).toBe(1);

      const unreadMessage = await send(alice, conversationId, `unread-${testSuffix()}`);
      const bobBeforeRead = await callUnary<GetConversationRequest, GetConversationResponse>(
        messages.getConversation.bind(messages),
        { id: conversationId },
        { accessToken: bob.accessToken },
      );
      expect.soft(bobBeforeRead.conversation?.unreadCount).toBe(1);
      const bobMemberBefore = bobBeforeRead.conversation?.members.find(
        (member) => member.actor?.id === bob.actorId,
      );
      const aliceMemberBefore = bobBeforeRead.conversation?.members.find(
        (member) => member.actor?.id === alice.actorId,
      );
      expect(bobMemberBefore?.lastReadMessageId).not.toBe('');
      expect(aliceMemberBefore?.lastReadMessageId).toBe('');

      await callUnary<MarkConversationReadRequest, MarkConversationReadResponse>(
        messages.markConversationRead.bind(messages),
        { conversationId, throughMessageId: unreadMessage.id },
        { accessToken: bob.accessToken },
      );
      const bobAfterRead = await callUnary<GetConversationRequest, GetConversationResponse>(
        messages.getConversation.bind(messages),
        { id: conversationId },
        { accessToken: bob.accessToken },
      );
      expect.soft(bobAfterRead.conversation?.unreadCount).toBe(0);
      expect(
        bobAfterRead.conversation?.members.find((member) => member.actor?.id === bob.actorId)
          ?.lastReadMessageId,
      ).toBe(unreadMessage.id);
      expect(
        bobAfterRead.conversation?.members.find((member) => member.actor?.id === alice.actorId)
          ?.lastReadMessageId,
      ).toBe('');

      const evidenceMessages = [];
      for (let index = 0; index < 11; index += 1) {
        const sender = index % 2 === 0 ? alice : bob;
        evidenceMessages.push(
          await send(sender, conversationId, `report-evidence-${String(index)}-${testSuffix()}`),
        );
      }
      const reportedMessage = evidenceMessages[5]!;
      const reportResponse = await callUnary<ReportMessageRequest, ReportMessageResponse>(
        moderation.reportMessage.bind(moderation),
        {
          messageId: reportedMessage.id,
          reason: REPORT_REASON.HARASSMENT,
          details: 'Bounded integration evidence',
        },
        { accessToken: bob.accessToken },
      );
      const report = await dataSource
        .getRepository(Report)
        .findOneByOrFail({ id: reportResponse.reportId });
      expect(report.subjectType).toBe('MESSAGE');
      expect(report.subjectMessageId).toBe(reportedMessage.id);
      expect(report.messageSnapshot).not.toBeNull();
      expect(report.messageSnapshot!.length).toBeGreaterThan(0);
      expect(report.messageSnapshot!.length).toBeLessThanOrEqual(10);
      expect(report.messageSnapshot!.some((entry) => entry.id === reportedMessage.id)).toBe(true);

      const tombstoneTarget = evidenceMessages[0]!;
      const tombstoned = await callUnary<DeleteMessageRequest, DeleteMessageResponse>(
        messages.deleteMessage.bind(messages),
        { id: tombstoneTarget.id },
        { accessToken: alice.accessToken },
      );
      expect(tombstoned.message?.body).toBe('');
      expect(tombstoned.message?.deletedAt).toBeDefined();
      const storedTombstone = await dataSource
        .getRepository(Message)
        .findOneByOrFail({ id: tombstoneTarget.id });
      expect(storedTombstone.body).toBe('');
      expect(storedTombstone.deletedAt).not.toBeNull();

      await createTestBlock(dataSource.manager, {
        blockerActorId: bob.actorId,
        blockedActorId: alice.actorId,
      });
      const secretSentinel = `must-not-leak-${randomUUID()}`;
      const blockedError = await expectRejection<SendMessageRequest, SendMessageResponse>(
        messages.sendMessage.bind(messages),
        {
          clientRequestId: randomUUID(),
          conversationId,
          body: secretSentinel,
        },
        { accessToken: alice.accessToken },
      );
      const unavailableError = await expectRejection<SendMessageRequest, SendMessageResponse>(
        messages.sendMessage.bind(messages),
        {
          clientRequestId: randomUUID(),
          conversationId: randomUUID(),
          body: 'ordinary unavailable body',
        },
        { accessToken: alice.accessToken },
      );
      expect(blockedError.code).toBe(GrpcStatus.NOT_FOUND);
      expect(blockedError.code).toBe(unavailableError.code);
      expect(blockedError.details).toBe(unavailableError.details);
      expect(`${blockedError.message}\n${blockedError.details}`).not.toContain(secretSentinel);
    }, 60_000);

    it('opens a direct conversation immediately for mutual follows', async () => {
      const carol = await newActor('Carol');
      const dave = await newActor('Dave');
      await createTestFollow(dataSource.manager, {
        followerActorId: carol.actorId,
        followeeActorId: dave.actorId,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: dave.actorId,
        followeeActorId: carol.actorId,
      });

      const response = await callUnary<CreateConversationRequest, CreateConversationResponse>(
        messages.createConversation.bind(messages),
        {
          clientRequestId: randomUUID(),
          recipientActorIds: [dave.actorId],
          initialBody: `mutual-${testSuffix()}`,
        },
        { accessToken: carol.accessToken },
      );
      expect(response.request).toBeNull();
      expect(response.conversation?.kind).toBe(CONVERSATION_KIND.DIRECT);
      expect(response.conversation?.members).toHaveLength(2);
      const conversationId = response.conversation?.id;
      if (conversationId === undefined) throw new Error('Expected a mutual direct conversation.');
      expect(
        await dataSource.getRepository(Message).count({
          where: { conversationId },
        }),
      ).toBe(1);
    });

    it('rejects a group larger than eight total members', async () => {
      const creator = await newActor('Group creator');
      const error = await expectRejection<CreateConversationRequest, CreateConversationResponse>(
        messages.createConversation.bind(messages),
        {
          clientRequestId: randomUUID(),
          recipientActorIds: Array.from({ length: 8 }, () => randomUUID()),
          initialBody: 'too many members',
        },
        { accessToken: creator.accessToken },
      );
      expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });
  },
);
