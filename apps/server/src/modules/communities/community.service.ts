import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  appendAdminAuditLog,
  Block,
  Community,
  CommunityBan,
  CommunityInvite,
  CommunityMember,
  type CommunityRole,
  Post,
} from '@patches/database';
import { MAX_COMMUNITY_MODERATORS, RATE_LIMITS } from '@patches/domain';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { toActorSummary, type ActorSummary } from '../auth/auth.dto.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { NotificationsService } from '../notifications/notification.service.js';
import type {
  CommunityInviteView,
  CommunityListPage,
  CommunityMemberListPage,
  CommunityMemberView,
  CommunityView,
  ViewerCommunityRole,
} from './community.dto.js';
import {
  parseCommunityDescription,
  parseCommunityDisplayName,
  parseCommunityName,
  parseCommunityRules,
  parseCommunityUpdateMask,
  parseInput,
  parseModerationReason,
  uuidInputSchema,
} from './community-validation.js';

export interface CreateCommunityInput {
  actorId: string;
  clientRequestId: string;
  name: string;
  displayName: string;
  description: string;
  rules: string;
  isPublic: boolean;
}

export interface UpdateCommunityInput {
  id: string;
  displayName: string;
  description: string;
  rules: string;
  isPublic: boolean;
  updateMask: readonly string[];
}

/** Application logic for local communities (§182): capability/rate-gated writes,
 * chronological keyset reads, scoped moderation with community-subject audit rows, and
 * block-aware invites which never join the recipient automatically. */
@Injectable()
export class CommunityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
    private readonly rateLimits: DbRateLimitStore,
  ) {}

  async createCommunity(input: CreateCommunityInput): Promise<CommunityView> {
    const clientRequestId = parseInput(uuidInputSchema, input.clientRequestId);
    const existing = await this.findCreateByIdempotencyKey(input.actorId, clientRequestId);
    if (existing !== null) {
      return this.toView(this.dataSource.manager, existing, input.actorId);
    }

    const name = parseCommunityName(input.name);
    const displayName = parseCommunityDisplayName(input.displayName);
    const description = parseCommunityDescription(input.description);
    const rules = parseCommunityRules(input.rules);
    if (!input.isPublic) {
      throw AppError.validation('Only public communities are supported in v0.');
    }
    if (!this.config.canCreateCommunity) {
      throw new AppError('COMMUNITY_FORBIDDEN', 'Community creation is disabled on this node.');
    }

    await this.consumeRateLimit(
      `community_create:subject:${input.actorId}`,
      24 * 60 * 60_000,
      RATE_LIMITS.communityCreatePerDay,
    );

    let community: Community;
    try {
      community = await this.dataSource.transaction(async (manager) => {
        const communities = manager.getRepository(Community);
        const created = await communities.save(
          communities.create({
            name,
            displayName,
            description,
            rules,
            createdByActorId: input.actorId,
            clientRequestId,
            isPublic: input.isPublic,
          }),
        );

        await manager.getRepository(CommunityMember).save(
          manager.getRepository(CommunityMember).create({
            communityId: created.id,
            actorId: input.actorId,
            role: 'MODERATOR',
          }),
        );
        // `Repository.save()` does not hydrate relations. `toView()` always maps the creator,
        // so return the same fully-loaded shape as the idempotency/get paths.
        return manager.getRepository(Community).findOneOrFail({
          where: { id: created.id },
          relations: { createdByActor: true },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // The transaction is fully rolled back before this re-read. Querying inside the catch
      // of the failed INSERT would run on PostgreSQL's aborted transaction and mask the
      // useful conflict with "current transaction is aborted".
      const concurrentRetry = await this.findCreateByIdempotencyKey(input.actorId, clientRequestId);
      if (concurrentRetry !== null) {
        return this.toView(this.dataSource.manager, concurrentRetry, input.actorId);
      }
      throw new AppError('COMMUNITY_NAME_TAKEN', 'That community name is already taken.');
    }

    return this.toView(this.dataSource.manager, community, input.actorId);
  }

  async getCommunity(idRaw: string, viewerActorId: string | undefined): Promise<CommunityView> {
    const id = parseInput(uuidInputSchema, idRaw);
    const community = await this.loadCommunityOrThrow(this.dataSource.manager, id);
    return this.toView(this.dataSource.manager, community, viewerActorId);
  }

  /** Public communities only — the only kind spec §182.1 describes for v0. */
  async listCommunities(
    cursorRaw: string,
    limit: number,
    viewerActorId?: string,
  ): Promise<CommunityListPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Community)
      .createQueryBuilder('community')
      .leftJoinAndSelect('community.createdByActor', 'createdByActor')
      .where('community.isPublic = TRUE')
      .orderBy('community.createdAt', 'DESC')
      .addOrderBy('community.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(community.createdAt, community.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const countsByCommunityId = await this.countsForMany(
      this.dataSource.manager,
      page.map((row) => row.id),
    );
    const rolesByCommunityId = await this.rolesForMany(
      this.dataSource.manager,
      page.map((row) => row.id),
      viewerActorId,
    );
    const communities = page.map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      description: row.description,
      rules: row.rules,
      createdBy: toActorSummary(row.createdByActor),
      isPublic: row.isPublic,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      counts: countsByCommunityId.get(row.id) ?? { members: 0, posts: 0 },
      viewerRole: rolesByCommunityId.get(row.id) ?? 'NONE',
    }));

    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { communities, nextCursor, hasMore };
  }

  /** Idempotent: joining a community the caller already belongs to is a no-op (spec §182.3).
   * Rejects a banned actor uniformly, never revealing whether the ban is what stopped them
   * versus some other failure — same §62 reasoning `GraphService.followActor` documents for
   * blocks. */
  async joinCommunity(actorId: string, communityIdRaw: string): Promise<CommunityView> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const community = await this.loadCommunityOrThrow(this.dataSource.manager, communityId);
    if (!community.isPublic) {
      throw new AppError(
        'COMMUNITY_FORBIDDEN',
        'This community is not open to self-service joins.',
      );
    }

    const members = this.dataSource.getRepository(CommunityMember);
    const existing = await members.findOne({ where: { communityId, actorId } });
    if (existing === null) {
      const banned = await this.dataSource
        .getRepository(CommunityBan)
        .exists({ where: { communityId, actorId } });
      if (banned) {
        throw new AppError('COMMUNITY_BANNED', 'You cannot join this community.');
      }

      await this.consumeRateLimit(
        `community_join:subject:${actorId}`,
        24 * 60 * 60_000,
        RATE_LIMITS.communityJoinPerDay,
      );

      try {
        await members.save(members.create({ communityId, actorId, role: 'MEMBER' }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    return this.toView(this.dataSource.manager, community, actorId);
  }

  /** Idempotent: leaving a community the caller doesn't belong to is a no-op (spec §182.3). */
  async leaveCommunity(actorId: string, communityIdRaw: string): Promise<CommunityView> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const community = await this.loadCommunityOrThrow(this.dataSource.manager, communityId);
    if (community.createdByActorId === actorId) {
      throw new AppError('COMMUNITY_FORBIDDEN', 'The community creator cannot leave.');
    }
    await this.dataSource.getRepository(CommunityMember).delete({ communityId, actorId });
    return this.toView(this.dataSource.manager, community, actorId);
  }

  async listCommunityMembers(
    communityIdRaw: string,
    cursorRaw: string,
    limit: number,
  ): Promise<CommunityMemberListPage> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    await this.loadCommunityOrThrow(this.dataSource.manager, communityId);

    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(CommunityMember)
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.actor', 'actor')
      .where('member.communityId = :communityId', { communityId })
      .orderBy('member.joinedAt', 'DESC')
      .addOrderBy('member.actorId', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(member.joinedAt, member.actorId) < (:cursorJoinedAt, :cursorId)', {
        cursorJoinedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const members = page.map((row) => toMemberView(row));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.joinedAt,
      id: row.actorId,
    }));
    return { members, nextCursor, hasMore };
  }

  async updateCommunity(actorId: string, input: UpdateCommunityInput): Promise<CommunityView> {
    const id = parseInput(uuidInputSchema, input.id);
    const paths = parseCommunityUpdateMask(input.updateMask);

    const community = await this.dataSource.transaction(async (manager) => {
      const community = await this.loadCommunityOrThrow(manager, id);
      await this.requireModerator(manager, id, actorId);

      const patch: Partial<Pick<Community, 'displayName' | 'description' | 'rules' | 'isPublic'>> =
        {};
      if (paths.has('display_name')) {
        patch.displayName = parseCommunityDisplayName(input.displayName);
      }
      if (paths.has('description')) {
        patch.description = parseCommunityDescription(input.description);
      }
      if (paths.has('rules')) {
        patch.rules = parseCommunityRules(input.rules);
      }
      if (paths.has('is_public')) {
        if (!input.isPublic) {
          throw AppError.validation('Only public communities are supported in v0.');
        }
        patch.isPublic = input.isPublic;
      }

      if (Object.keys(patch).length === 0) return community;
      const saved = await manager.getRepository(Community).save(Object.assign(community, patch));
      await appendAdminAuditLog(manager, {
        adminUserId: await this.requireUserId(manager, actorId),
        action: 'community.update',
        subjectType: 'COMMUNITY',
        subjectId: id,
        metadata: { paths: [...paths] },
      });
      return saved;
    });

    return this.toView(this.dataSource.manager, community, actorId);
  }

  /** Requires the caller to be a moderator; the creator's role can never be changed (spec
   * §182.3), and promoting past {@link MAX_COMMUNITY_MODERATORS} is rejected. */
  async setCommunityRole(
    actorId: string,
    communityIdRaw: string,
    targetActorIdRaw: string,
    role: CommunityRole,
  ): Promise<CommunityMemberView> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const targetActorId = parseInput(uuidInputSchema, targetActorIdRaw);
    if (role !== 'MEMBER' && role !== 'MODERATOR') {
      throw AppError.validation('role must be MEMBER or MODERATOR.');
    }

    const member = await this.dataSource.transaction(async (manager) => {
      const community = await this.loadCommunityOrThrow(manager, communityId);
      await this.requireModerator(manager, communityId, actorId);

      if (targetActorId === community.createdByActorId) {
        throw new AppError(
          'COMMUNITY_FORBIDDEN',
          "The community creator's role cannot be changed.",
        );
      }

      const members = manager.getRepository(CommunityMember);
      const target = await members.findOne({ where: { communityId, actorId: targetActorId } });
      if (target === null) {
        throw AppError.validation('That actor is not a member of this community.');
      }

      if (role === 'MODERATOR' && target.role !== 'MODERATOR') {
        const moderatorCount = await members.countBy({ communityId, role: 'MODERATOR' });
        if (moderatorCount >= MAX_COMMUNITY_MODERATORS) {
          throw AppError.validation(
            `A community can have at most ${String(MAX_COMMUNITY_MODERATORS)} moderators.`,
          );
        }
      }

      target.role = role;
      const saved = await members.save(target);

      await appendAdminAuditLog(manager, {
        adminUserId: await this.requireUserId(manager, actorId),
        action: 'community.set_role',
        subjectType: 'COMMUNITY',
        subjectId: communityId,
        metadata: { targetActorId, role },
      });

      return saved;
    });

    const actor = await this.dataSource.getRepository(Actor).findOneOrFail({
      where: { id: targetActorId },
    });
    return toMemberView(Object.assign(member, { actor }));
  }

  /** Moderator-only: detaches a post from the community without deleting it — the post
   * survives on its author's profile with `community_id` cleared (spec §182.3). */
  async removePostFromCommunity(
    actorId: string,
    communityIdRaw: string,
    postIdRaw: string,
  ): Promise<void> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const postId = parseInput(uuidInputSchema, postIdRaw);

    await this.dataSource.transaction(async (manager) => {
      await this.loadCommunityOrThrow(manager, communityId);
      await this.requireModerator(manager, communityId, actorId);

      const posts = manager.getRepository(Post);
      const post = await posts.findOne({ where: { id: postId } });
      if (post === null || post.communityId !== communityId) {
        throw new AppError('POST_NOT_FOUND', 'That post is not in this community.');
      }

      await posts.update({ id: postId }, { communityId: null });

      await appendAdminAuditLog(manager, {
        adminUserId: await this.requireUserId(manager, actorId),
        action: 'community.remove_post',
        subjectType: 'COMMUNITY',
        subjectId: communityId,
        metadata: { postId },
      });
    });
  }

  async banFromCommunity(
    actorId: string,
    communityIdRaw: string,
    targetActorIdRaw: string,
    reasonRaw: string,
  ): Promise<void> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const targetActorId = parseInput(uuidInputSchema, targetActorIdRaw);
    const reason = parseModerationReason(reasonRaw);
    if (targetActorId === actorId) {
      throw AppError.validation('You cannot ban yourself.');
    }

    await this.dataSource.transaction(async (manager) => {
      const community = await this.loadCommunityOrThrow(manager, communityId);
      await this.requireModerator(manager, communityId, actorId);

      if (targetActorId === community.createdByActorId) {
        throw new AppError('COMMUNITY_FORBIDDEN', 'The community creator cannot be banned.');
      }

      const bans = manager.getRepository(CommunityBan);
      const target = await manager.getRepository(Actor).findOne({ where: { id: targetActorId } });
      if (target === null || target.deletedAt !== null) {
        throw new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
      }
      await bans.save(
        bans.create({
          communityId,
          actorId: targetActorId,
          reason,
          bannedByActorId: actorId,
        }),
      );
      await manager.getRepository(CommunityMember).delete({ communityId, actorId: targetActorId });

      await appendAdminAuditLog(manager, {
        adminUserId: await this.requireUserId(manager, actorId),
        action: 'community.ban',
        subjectType: 'COMMUNITY',
        subjectId: communityId,
        metadata: { targetActorId, reason },
      });
    });
  }

  /** Rate-limited, block-aware unsolicited-contact vector (spec §188, §192) — never
   * auto-joins the invitee. A second invite while one is already pending returns the
   * existing invite rather than erroring, matching Join/Leave's idempotency spirit even
   * though §182.3 does not say this one explicitly. */
  async inviteToCommunity(
    actorId: string,
    communityIdRaw: string,
    inviteeActorIdRaw: string,
  ): Promise<CommunityInviteView> {
    const communityId = parseInput(uuidInputSchema, communityIdRaw);
    const inviteeActorId = parseInput(uuidInputSchema, inviteeActorIdRaw);
    if (inviteeActorId === actorId) {
      throw AppError.validation('You cannot invite yourself.');
    }

    await this.loadCommunityOrThrow(this.dataSource.manager, communityId);

    const members = this.dataSource.getRepository(CommunityMember);
    const isMember = await members.exists({ where: { communityId, actorId } });
    if (!isMember) {
      throw new AppError('COMMUNITY_FORBIDDEN', 'Only members can invite others.');
    }
    const inviteeAlreadyMember = await members.exists({
      where: { communityId, actorId: inviteeActorId },
    });
    if (inviteeAlreadyMember) {
      throw AppError.validation('That actor is already a member of this community.');
    }
    const inviteeBanned = await this.dataSource
      .getRepository(CommunityBan)
      .exists({ where: { communityId, actorId: inviteeActorId } });
    if (inviteeBanned) {
      throw new AppError('COMMUNITY_FORBIDDEN', 'That actor is not available to invite.');
    }

    const invitee = await this.dataSource.getRepository(Actor).findOne({
      where: { id: inviteeActorId },
    });
    if (invitee === null || invitee.deletedAt !== null) {
      throw new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
    }
    if (await this.blockedEitherDirection(actorId, inviteeActorId)) {
      throw new AppError('ACTOR_BLOCKED', 'You cannot invite this actor.');
    }

    await this.consumeRateLimit(
      `community_invite:subject:${actorId}`,
      24 * 60 * 60_000,
      RATE_LIMITS.communityInvitePerDay,
    );
    await this.consumeRateLimit(
      `community_invite_per_community:subject:${actorId}:${communityId}`,
      60 * 60_000,
      RATE_LIMITS.communityInvitePerCommunityPerHour,
    );

    const invites = this.dataSource.getRepository(CommunityInvite);
    let invite: CommunityInvite;
    let created = false;
    try {
      invite = await invites.save(
        invites.create({ communityId, inviterActorId: actorId, inviteeActorId }),
      );
      created = true;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await invites.findOne({
        where: { communityId, inviteeActorId, status: 'PENDING' },
      });
      if (existing === null) throw error;
      invite = existing;
    }

    if (created) {
      await this.notifications.notifyCommunityInvite(inviteeActorId, actorId, communityId);
    }

    const inviter = await this.dataSource.getRepository(Actor).findOneOrFail({
      where: { id: actorId },
    });
    return toInviteView(invite, inviter, invitee);
  }

  async respondToCommunityInvite(
    actorId: string,
    inviteIdRaw: string,
    accept: boolean,
  ): Promise<CommunityInviteView> {
    const inviteId = parseInput(uuidInputSchema, inviteIdRaw);

    const invite = await this.dataSource.transaction(async (manager) => {
      const invites = manager.getRepository(CommunityInvite);
      const invite = await invites.findOne({
        where: { id: inviteId },
        relations: { inviterActor: true, inviteeActor: true },
      });
      // Uniform not-found for a missing invite and one that belongs to someone else (§62):
      // a caller must never learn an invite id exists for another actor.
      if (invite === null || invite.inviteeActorId !== actorId) {
        throw new AppError('COMMUNITY_INVITE_NOT_FOUND', 'That invite does not exist.');
      }
      if (invite.status !== 'PENDING') {
        throw AppError.validation('This invite has already been responded to.');
      }

      invite.status = accept ? 'ACCEPTED' : 'DECLINED';
      const saved = await invites.save(invite);

      if (accept) {
        const banned = await manager
          .getRepository(CommunityBan)
          .exists({ where: { communityId: invite.communityId, actorId } });
        if (banned) {
          throw new AppError('COMMUNITY_BANNED', 'You cannot join this community.');
        }
        const members = manager.getRepository(CommunityMember);
        const existing = await members.findOne({
          where: { communityId: invite.communityId, actorId },
        });
        if (existing === null) {
          await members.save(
            members.create({ communityId: invite.communityId, actorId, role: 'MEMBER' }),
          );
        }
      }

      return saved;
    });

    return toInviteView(invite, invite.inviterActor, invite.inviteeActor);
  }

  // ---------------------------------------------------------------- internals

  private async loadCommunityOrThrow(manager: EntityManager, id: string): Promise<Community> {
    const community = await manager
      .getRepository(Community)
      .findOne({ where: { id }, relations: { createdByActor: true } });
    if (community === null) {
      throw new AppError('COMMUNITY_NOT_FOUND', 'That community does not exist.');
    }
    return community;
  }

  private findCreateByIdempotencyKey(
    actorId: string,
    clientRequestId: string,
  ): Promise<Community | null> {
    return this.dataSource.getRepository(Community).findOne({
      where: { createdByActorId: actorId, clientRequestId },
      relations: { createdByActor: true },
    });
  }

  private async requireModerator(
    manager: EntityManager,
    communityId: string,
    actorId: string,
  ): Promise<CommunityMember> {
    const member = await manager
      .getRepository(CommunityMember)
      .findOne({ where: { communityId, actorId } });
    if (member === null || member.role !== 'MODERATOR') {
      throw new AppError(
        'COMMUNITY_FORBIDDEN',
        'You must be a moderator of this community to do that.',
      );
    }
    return member;
  }

  private async toView(
    manager: EntityManager,
    community: Community,
    viewerActorId: string | undefined,
  ): Promise<CommunityView> {
    const [counts, viewerRole] = await Promise.all([
      this.countsFor(manager, community.id),
      this.viewerRoleFor(manager, community.id, viewerActorId),
    ]);
    return {
      id: community.id,
      name: community.name,
      displayName: community.displayName,
      description: community.description,
      rules: community.rules,
      createdBy: toActorSummary(community.createdByActor),
      isPublic: community.isPublic,
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
      counts,
      viewerRole,
    };
  }

  private async viewerRoleFor(
    manager: EntityManager,
    communityId: string,
    viewerActorId: string | undefined,
  ): Promise<ViewerCommunityRole> {
    if (viewerActorId === undefined) return 'NONE';
    const member = await manager
      .getRepository(CommunityMember)
      .findOne({ where: { communityId, actorId: viewerActorId } });
    return member?.role ?? 'NONE';
  }

  private async countsFor(
    manager: EntityManager,
    communityId: string,
  ): Promise<{ members: number; posts: number }> {
    const [members, posts] = await Promise.all([
      manager.getRepository(CommunityMember).countBy({ communityId }),
      manager.getRepository(Post).countBy({ communityId }),
    ]);
    return { members, posts };
  }

  private async countsForMany(
    manager: EntityManager,
    communityIds: readonly string[],
  ): Promise<Map<string, { members: number; posts: number }>> {
    const counts = new Map<string, { members: number; posts: number }>(
      communityIds.map((id) => [id, { members: 0, posts: 0 }]),
    );
    if (communityIds.length === 0) return counts;

    const [memberRows, postRows] = await Promise.all([
      manager
        .getRepository(CommunityMember)
        .createQueryBuilder('member')
        .select('member.communityId', 'communityId')
        .addSelect('COUNT(*)', 'count')
        .where('member.communityId IN (:...communityIds)', { communityIds })
        .groupBy('member.communityId')
        .getRawMany<{ communityId: string; count: string }>(),
      manager
        .getRepository(Post)
        .createQueryBuilder('post')
        .select('post.communityId', 'communityId')
        .addSelect('COUNT(*)', 'count')
        .where('post.communityId IN (:...communityIds)', { communityIds })
        .groupBy('post.communityId')
        .getRawMany<{ communityId: string; count: string }>(),
    ]);

    for (const row of memberRows) {
      const existing = counts.get(row.communityId);
      if (existing !== undefined) existing.members = Number(row.count);
    }
    for (const row of postRows) {
      const existing = counts.get(row.communityId);
      if (existing !== undefined) existing.posts = Number(row.count);
    }
    return counts;
  }

  private async rolesForMany(
    manager: EntityManager,
    communityIds: readonly string[],
    viewerActorId: string | undefined,
  ): Promise<Map<string, ViewerCommunityRole>> {
    if (viewerActorId === undefined || communityIds.length === 0) return new Map();
    const rows = await manager.getRepository(CommunityMember).find({
      where: communityIds.map((communityId) => ({ communityId, actorId: viewerActorId })),
    });
    return new Map(rows.map((row) => [row.communityId, row.role]));
  }

  private async blockedEitherDirection(actorAId: string, actorBId: string): Promise<boolean> {
    const blocks = this.dataSource.getRepository(Block);
    const [aBlocksB, bBlocksA] = await Promise.all([
      blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
      blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
    ]);
    return aBlocksB !== null || bBlocksA !== null;
  }

  /** The acting moderator's own `users.id`, for `admin_audit_log.admin_user_id` — `null` for
   * a (v0-impossible in practice, since only local actors can moderate a v0 community)
   * account-less actor, in which case the caller's own actor id is used as a best-effort
   * fallback by the call sites above rather than skipping the audit row entirely. */
  private async requireUserId(manager: EntityManager, actorId: string): Promise<string> {
    const actor = await manager.getRepository(Actor).findOne({ where: { id: actorId } });
    if (actor?.userId === null || actor?.userId === undefined) {
      throw AppError.internal('A local community moderator account is required.');
    }
    return actor.userId;
  }

  private async consumeRateLimit(key: string, windowMs: number, limit: number): Promise<void> {
    const count = await this.rateLimits.increment(key, windowMs, new Date());
    if (count > limit) {
      throw new AppError('RATE_LIMITED', 'Too many requests. Try again later.');
    }
  }
}

function toMemberView(row: CommunityMember & { actor: Actor }): CommunityMemberView {
  return { actor: toActorSummary(row.actor), role: row.role, joinedAt: row.joinedAt };
}

function toInviteView(
  invite: CommunityInvite,
  inviter: Actor,
  invitee: Actor,
): CommunityInviteView {
  return {
    id: invite.id,
    communityId: invite.communityId,
    inviter: toActorSummary(inviter),
    invitee: toActorSummary(invitee),
    status: invite.status,
    createdAt: invite.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

// Re-exported so `community.controller.ts` doesn't need a second import line for a type this
// service already imports.
export type { ActorSummary };
