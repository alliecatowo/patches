import {
  ActorFlair,
  Community,
  CommunityBan,
  CommunityInvite,
  CommunityMember,
  Conversation,
  ConversationMember,
  Message,
  MessageRequest,
  PinnedPost,
  PostEdit,
  PostTag,
  Repost,
  Tag,
  TagMute,
} from '@patches/database';
import type {
  CommunityInviteStatus,
  CommunityRole,
  ConversationKind,
  MessageRequestStatus,
} from '@patches/database';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';

/**
 * Amendment B (§188-190, P11-002) fixtures — same shape as every other factory in this
 * directory: caller-supplied `EntityManager`, so fixtures roll back with
 * `withTransactionRollback`.
 */

export interface CreateTestRepostOptions {
  actorId: string;
  postId: string;
  createdAt?: Date;
}

export async function createTestRepost(
  manager: EntityManager,
  options: CreateTestRepostOptions,
): Promise<Repost> {
  const reposts = manager.getRepository(Repost);
  return reposts.save(
    reposts.create({
      actorId: options.actorId,
      postId: options.postId,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestTagOptions {
  /** Canonical (NFKC + casefolded) form. Defaults to a random lowercase tag so tests never
   * collide on the unique `name` constraint. */
  name?: string;
  displayName?: string;
}

export async function createTestTag(
  manager: EntityManager,
  options: CreateTestTagOptions = {},
): Promise<Tag> {
  const tags = manager.getRepository(Tag);
  const name = options.name ?? `tag${randomUUID().slice(0, 8)}`;
  return tags.save(
    tags.create({
      name,
      displayName: options.displayName ?? name,
    }),
  );
}

export interface CreateTestPostTagOptions {
  postId: string;
  tagId: string;
  createdAt?: Date;
}

export async function createTestPostTag(
  manager: EntityManager,
  options: CreateTestPostTagOptions,
): Promise<PostTag> {
  const postTags = manager.getRepository(PostTag);
  return postTags.save(
    postTags.create({
      postId: options.postId,
      tagId: options.tagId,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestTagMuteOptions {
  actorId: string;
  tagId: string;
  createdAt?: Date;
}

export async function createTestTagMute(
  manager: EntityManager,
  options: CreateTestTagMuteOptions,
): Promise<TagMute> {
  const tagMutes = manager.getRepository(TagMute);
  return tagMutes.save(
    tagMutes.create({
      actorId: options.actorId,
      tagId: options.tagId,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestCommunityOptions {
  createdByActorId: string;
  /** `[a-z0-9_]`, 3-32 characters. Defaults to a random lowercase name so tests never collide
   * on the unique `name` constraint. */
  name?: string;
  displayName?: string;
  description?: string;
  rules?: string;
  isPublic?: boolean;
}

export async function createTestCommunity(
  manager: EntityManager,
  options: CreateTestCommunityOptions,
): Promise<Community> {
  const communities = manager.getRepository(Community);
  const name = options.name ?? `c${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return communities.save(
    communities.create({
      name,
      displayName: options.displayName ?? name,
      description: options.description ?? '',
      rules: options.rules ?? '',
      createdByActorId: options.createdByActorId,
      isPublic: options.isPublic ?? true,
    }),
  );
}

export interface CreateTestCommunityMemberOptions {
  communityId: string;
  actorId: string;
  role?: CommunityRole;
  joinedAt?: Date;
}

export async function createTestCommunityMember(
  manager: EntityManager,
  options: CreateTestCommunityMemberOptions,
): Promise<CommunityMember> {
  const members = manager.getRepository(CommunityMember);
  return members.save(
    members.create({
      communityId: options.communityId,
      actorId: options.actorId,
      role: options.role ?? 'MEMBER',
      ...(options.joinedAt === undefined ? {} : { joinedAt: options.joinedAt }),
    }),
  );
}

export interface CreateTestCommunityBanOptions {
  communityId: string;
  actorId: string;
  reason?: string | null;
  bannedByActorId?: string | null;
  createdAt?: Date;
}

export async function createTestCommunityBan(
  manager: EntityManager,
  options: CreateTestCommunityBanOptions,
): Promise<CommunityBan> {
  const bans = manager.getRepository(CommunityBan);
  return bans.save(
    bans.create({
      communityId: options.communityId,
      actorId: options.actorId,
      reason: options.reason ?? null,
      bannedByActorId: options.bannedByActorId ?? null,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestCommunityInviteOptions {
  communityId: string;
  inviterActorId: string;
  inviteeActorId: string;
  status?: CommunityInviteStatus;
  createdAt?: Date;
}

export async function createTestCommunityInvite(
  manager: EntityManager,
  options: CreateTestCommunityInviteOptions,
): Promise<CommunityInvite> {
  const invites = manager.getRepository(CommunityInvite);
  return invites.save(
    invites.create({
      communityId: options.communityId,
      inviterActorId: options.inviterActorId,
      inviteeActorId: options.inviteeActorId,
      status: options.status ?? 'PENDING',
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestConversationOptions {
  createdByActorId?: string | null;
  kind?: ConversationKind;
  createdAt?: Date;
  lastMessageAt?: Date;
}

export async function createTestConversation(
  manager: EntityManager,
  options: CreateTestConversationOptions = {},
): Promise<Conversation> {
  const conversations = manager.getRepository(Conversation);
  const now = new Date();
  return conversations.save(
    conversations.create({
      createdByActorId: options.createdByActorId ?? null,
      kind: options.kind ?? 'DIRECT',
      lastMessageAt: options.lastMessageAt ?? now,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestConversationMemberOptions {
  conversationId: string;
  actorId: string;
  joinedAt?: Date;
  leftAt?: Date | null;
  lastReadMessageId?: string | null;
  muted?: boolean;
}

export async function createTestConversationMember(
  manager: EntityManager,
  options: CreateTestConversationMemberOptions,
): Promise<ConversationMember> {
  const members = manager.getRepository(ConversationMember);
  return members.save(
    members.create({
      conversationId: options.conversationId,
      actorId: options.actorId,
      leftAt: options.leftAt ?? null,
      lastReadMessageId: options.lastReadMessageId ?? null,
      muted: options.muted ?? false,
      ...(options.joinedAt === undefined ? {} : { joinedAt: options.joinedAt }),
    }),
  );
}

export interface CreateTestMessageOptions {
  conversationId: string;
  senderActorId?: string | null;
  body?: string;
  createdAt?: Date;
  deletedAt?: Date | null;
}

export async function createTestMessage(
  manager: EntityManager,
  options: CreateTestMessageOptions,
): Promise<Message> {
  const messages = manager.getRepository(Message);
  const id = randomUUID();
  return messages.save(
    messages.create({
      id,
      conversationId: options.conversationId,
      senderActorId: options.senderActorId ?? null,
      body: options.body ?? `test message ${id}`,
      deletedAt: options.deletedAt ?? null,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestMessageRequestOptions {
  senderActorId: string;
  recipientActorId: string;
  body?: string;
  status?: MessageRequestStatus;
  createdAt?: Date;
}

export async function createTestMessageRequest(
  manager: EntityManager,
  options: CreateTestMessageRequestOptions,
): Promise<MessageRequest> {
  const requests = manager.getRepository(MessageRequest);
  return requests.save(
    requests.create({
      senderActorId: options.senderActorId,
      recipientActorId: options.recipientActorId,
      body: options.body ?? 'hey there',
      status: options.status ?? 'PENDING',
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestPostEditOptions {
  postId: string;
  previousBody?: string | null;
  previousContentWarning?: string | null;
  previousMediaManifest?: unknown[] | null;
  editedByActorId?: string | null;
  createdAt?: Date;
}

export async function createTestPostEdit(
  manager: EntityManager,
  options: CreateTestPostEditOptions,
): Promise<PostEdit> {
  const edits = manager.getRepository(PostEdit);
  return edits.save(
    edits.create({
      postId: options.postId,
      previousBody: options.previousBody ?? null,
      previousContentWarning: options.previousContentWarning ?? null,
      previousMediaManifest: options.previousMediaManifest ?? null,
      editedByActorId: options.editedByActorId ?? null,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestPinnedPostOptions {
  actorId: string;
  postId: string;
  /** 0-2 (§188). */
  position?: number;
  createdAt?: Date;
}

export async function createTestPinnedPost(
  manager: EntityManager,
  options: CreateTestPinnedPostOptions,
): Promise<PinnedPost> {
  const pinned = manager.getRepository(PinnedPost);
  return pinned.save(
    pinned.create({
      actorId: options.actorId,
      postId: options.postId,
      position: options.position ?? 0,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    }),
  );
}

export interface CreateTestActorFlairOptions {
  actorId: string;
  document?: unknown;
}

export async function createTestActorFlair(
  manager: EntityManager,
  options: CreateTestActorFlairOptions,
): Promise<ActorFlair> {
  const flairs = manager.getRepository(ActorFlair);
  return flairs.save(
    flairs.create({
      actorId: options.actorId,
      document: options.document ?? {},
    }),
  );
}
