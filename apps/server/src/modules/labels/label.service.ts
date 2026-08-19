import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Community,
  CommunityMember,
  Label,
  Labeler,
  LabelerSubscription,
  LabelerSubscriptionAction,
  Post,
  type LabelAction as DbLabelAction,
} from '@patches/database';
import { MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR, RATE_LIMITS } from '@patches/domain';
import { DataSource, IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import type { CommunitySummaryView } from '../posts/post.dto.js';
import {
  labelsForPosts as lookupLabelsForPosts,
  subscriberVisibleLabelerIds,
} from './label-lookup.js';
import type { LabelerListPage, LabelerView, LabelListPage, LabelView } from './label.dto.js';
import {
  parseExpiresAt,
  parseInput,
  parseLabelValue,
  parseStoredVocabulary,
  parseSubject,
  parseVocabulary,
  uuidInputSchema,
} from './label-validation.js';

export interface ApplyLabelInput {
  labelerId: string;
  subjectActorId: string;
  subjectPostId: string;
  value: string;
  expiresAt: Date | undefined;
}

/**
 * Application logic for `LabelService` (spec §200): closed-vocabulary labelers, rate-limited
 * label application, subscriber-scoped visibility, and self-inspection. A labeler operator's
 * authority never extends past their own labeler (§200.5, §208) — nothing here ever lets a
 * label change ordering, delivery, or anyone's view but a subscriber's own (§200.3, §208).
 */
@Injectable()
export class LabelService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimits: DbRateLimitStore,
  ) {}

  async createLabeler(
    actorId: string,
    communityIdRaw: string,
    vocabularyEntries: Parameters<typeof parseVocabulary>[0],
  ): Promise<LabelerView> {
    const vocabulary = parseVocabulary(vocabularyEntries);
    const communityId =
      communityIdRaw.length === 0 ? null : parseInput(uuidInputSchema, communityIdRaw);

    return this.dataSource.transaction(async (manager) => {
      if (communityId !== null) {
        await this.requireCommunityModerator(manager, communityId, actorId);
      }
      const labelers = manager.getRepository(Labeler);
      const saved = await labelers.save(
        labelers.create({
          actorId: communityId === null ? actorId : null,
          communityId,
          isNodeLabeler: false,
          vocabulary,
        }),
      );
      return this.toLabelerView(manager, saved);
    });
  }

  async getLabeler(idRaw: string): Promise<LabelerView> {
    const id = parseInput(uuidInputSchema, idRaw);
    const row = await this.dataSource.getRepository(Labeler).findOne({ where: { id } });
    if (row === null) throw new AppError('LABELER_NOT_FOUND', 'That labeler does not exist.');
    return this.toLabelerView(this.dataSource.manager, row);
  }

  async listLabelers(cursorRaw: string, limitRaw: number): Promise<LabelerListPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limitRaw);

    const qb = this.dataSource
      .getRepository(Labeler)
      .createQueryBuilder('labeler')
      .orderBy('labeler.createdAt', 'DESC')
      .addOrderBy('labeler.id', 'DESC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere('(labeler.createdAt, labeler.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    const labelers = await Promise.all(
      page.map((row) => this.toLabelerView(this.dataSource.manager, row)),
    );
    return { labelers, nextCursor, hasMore };
  }

  /** Rate-limited 300/day per labeler (§200.5, §204) — a labeler that can label faster than a
   * human can consider is bot moderation at scale. Idempotent: re-applying the exact same
   * still-active `(labeler, subject, value)` returns the existing row rather than creating a
   * duplicate or spending the rate-limit budget again, the same idempotency reasoning
   * `tag.service.ts#muteTag` documents. The node's own labeler cannot be operated through this
   * RPC at all (§200.5, §208) — nothing in a caller's gRPC session carries node-operator
   * authority, only an actor id. */
  async applyLabel(actorId: string, input: ApplyLabelInput): Promise<LabelView> {
    const labelerId = parseInput(uuidInputSchema, input.labelerId);
    const subject = parseSubject(input.subjectActorId, input.subjectPostId);
    const value = parseLabelValue(input.value);
    const now = new Date();
    const expiresAt = parseExpiresAt(input.expiresAt, now);

    return this.dataSource.transaction(async (manager) => {
      const labeler = await this.requireLabeler(manager, labelerId);
      await this.requireLabelerAuthority(manager, labeler, actorId);

      if (subject.subjectActorId !== null) {
        await this.requireActorExists(manager, subject.subjectActorId);
      } else if (subject.subjectPostId !== null) {
        await this.requirePostExists(manager, subject.subjectPostId);
      }

      const vocabulary = parseStoredVocabulary(labeler.vocabulary);
      if (!vocabulary.some((entry) => entry.value === value)) {
        throw new AppError(
          'LABEL_VALUE_INVALID',
          'That value is not part of this labeler’s vocabulary.',
        );
      }

      const labels = manager.getRepository(Label);
      const existing = await labels.findOne({
        where: {
          labelerId,
          subjectType: subject.subjectType,
          subjectActorId: subject.subjectActorId ?? IsNull(),
          subjectPostId: subject.subjectPostId ?? IsNull(),
          value,
          retractedAt: IsNull(),
        },
      });
      if (existing !== null) {
        return this.toLabelView(existing);
      }

      await this.consumeRateLimit(
        `label_apply:labeler:${labelerId}`,
        24 * 60 * 60_000,
        RATE_LIMITS.labelApplyPerDayPerLabeler,
      );

      const saved = await labels.save(
        labels.create({
          labelerId,
          subjectType: subject.subjectType,
          subjectActorId: subject.subjectActorId,
          subjectPostId: subject.subjectPostId,
          value,
          expiresAt,
        }),
      );
      return this.toLabelView(saved);
    });
  }

  /** Sets `retracted_at` rather than deleting the row — retraction preserves history (§200.1).
   * Idempotent: retracting an already-retracted label returns it unchanged. */
  async retractLabel(actorId: string, labelIdRaw: string): Promise<LabelView> {
    const labelId = parseInput(uuidInputSchema, labelIdRaw);
    return this.dataSource.transaction(async (manager) => {
      const label = await manager.getRepository(Label).findOne({ where: { id: labelId } });
      if (label === null) throw new AppError('LABEL_NOT_FOUND', 'That label does not exist.');

      const labeler = await this.requireLabeler(manager, label.labelerId);
      await this.requireLabelerAuthority(manager, labeler, actorId);

      if (label.retractedAt !== null) return this.toLabelView(label);
      label.retractedAt = new Date();
      const saved = await manager.getRepository(Label).save(label);
      return this.toLabelView(saved);
    });
  }

  /** The node's own labeler is subscribed by default for every viewer and cannot be
   * subscribed/unsubscribed through this RPC (§200.3) — calling it on a node labeler is a
   * harmless no-op rather than an error, so a defensively-calling client never breaks. */
  async subscribeLabeler(actorId: string, labelerIdRaw: string): Promise<void> {
    const labelerId = parseInput(uuidInputSchema, labelerIdRaw);
    await this.dataSource.transaction(async (manager) => {
      const labeler = await this.requireLabeler(manager, labelerId);
      if (labeler.isNodeLabeler) return;

      const subscriptions = manager.getRepository(LabelerSubscription);
      const existing = await subscriptions.findOne({ where: { actorId, labelerId } });
      if (existing !== null) return;

      const total = await subscriptions.countBy({ actorId });
      if (total >= MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR) {
        throw AppError.validation(
          `You can subscribe to at most ${String(MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR)} labelers.`,
        );
      }
      try {
        await subscriptions.save(subscriptions.create({ actorId, labelerId }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    });
  }

  async unsubscribeLabeler(actorId: string, labelerIdRaw: string): Promise<void> {
    const labelerId = parseInput(uuidInputSchema, labelerIdRaw);
    await this.dataSource.getRepository(LabelerSubscription).delete({ actorId, labelerId });
  }

  /** Per-value action override for the caller's own subscription (§200.1's action map). Any
   * value may be set to `IGNORE` except one the labeler's vocabulary marks `mandatory`
   * (§200.3). Independent of `labeler_subscriptions`' own row lifecycle (spec §202, mirrored
   * in `labeler-subscription-action.entity.ts`'s doc) — this works even for the node's own
   * labeler, which has no subscription row to begin with. */
  async setLabelerSubscriptionAction(
    actorId: string,
    labelerIdRaw: string,
    valueRaw: string,
    action: DbLabelAction,
  ): Promise<void> {
    const labelerId = parseInput(uuidInputSchema, labelerIdRaw);
    const value = parseLabelValue(valueRaw);

    await this.dataSource.transaction(async (manager) => {
      const labeler = await this.requireLabeler(manager, labelerId);
      const vocabulary = parseStoredVocabulary(labeler.vocabulary);
      const entry = vocabulary.find((candidate) => candidate.value === value);
      if (entry === undefined) {
        throw new AppError(
          'LABEL_VALUE_INVALID',
          'That value is not part of this labeler’s vocabulary.',
        );
      }
      if (action === 'IGNORE' && entry.mandatory) {
        throw AppError.validation('This value is legally mandatory and cannot be ignored.');
      }

      const actions = manager.getRepository(LabelerSubscriptionAction);
      const existing = await actions.findOne({ where: { actorId, labelerId, value } });
      if (existing !== null) {
        existing.action = action;
        await actions.save(existing);
        return;
      }
      try {
        await actions.save(actions.create({ actorId, labelerId, value, action }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    });
  }

  /** Pull-only self-inspection (§200.4): when the caller *is* the subject (their own account,
   * or a post they authored), every non-retracted, non-expired label is visible regardless of
   * subscription — that is the entire point of self-inspection, seeing labelers you don't
   * subscribe to. Otherwise this is exactly {@link labelsForPosts}'s subscription-scoped rule,
   * generalized to an actor subject too. */
  async listLabelsOnSubject(
    viewerActorId: string,
    subjectActorIdRaw: string,
    subjectPostIdRaw: string,
    cursorRaw: string,
    limitRaw: number,
  ): Promise<LabelListPage> {
    const subject = parseSubject(subjectActorIdRaw, subjectPostIdRaw);
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limitRaw);

    return this.dataSource.manager.transaction(async (manager) => {
      let isSelf: boolean;
      if (subject.subjectActorId !== null) {
        await this.requireActorExists(manager, subject.subjectActorId);
        isSelf = subject.subjectActorId === viewerActorId;
      } else {
        const post = await this.requirePostExists(manager, subject.subjectPostId!);
        isSelf = post.authorActorId === viewerActorId;
      }

      const now = new Date();
      const qb = manager
        .getRepository(Label)
        .createQueryBuilder('label')
        .where('label.retractedAt IS NULL')
        .andWhere('(label.expiresAt IS NULL OR label.expiresAt > :now)', { now })
        .orderBy('label.createdAt', 'DESC')
        .addOrderBy('label.id', 'DESC')
        .take(take + 1);

      if (subject.subjectActorId !== null) {
        qb.andWhere('label.subjectActorId = :subjectActorId', {
          subjectActorId: subject.subjectActorId,
        });
      } else {
        qb.andWhere('label.subjectPostId = :subjectPostId', {
          subjectPostId: subject.subjectPostId,
        });
      }
      if (!isSelf) {
        const labelerIds = await subscriberVisibleLabelerIds(manager, viewerActorId);
        if (labelerIds.length === 0) return { labels: [], nextCursor: '', hasMore: false };
        qb.andWhere('label.labelerId IN (:...labelerIds)', { labelerIds });
      }
      if (cursor !== undefined) {
        qb.andWhere('(label.createdAt, label.id) < (:cursorCreatedAt, :cursorId)', {
          cursorCreatedAt: cursor.createdAt,
          cursorId: cursor.id,
        });
      }

      const rows = await qb.getMany();
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
        createdAt: row.createdAt,
        id: row.id,
      }));
      return { labels: page.map((row) => this.toLabelView(row)), nextCursor, hasMore };
    });
  }

  /** `Post.labels` (spec §203): populated only for labelers `viewerActorId` subscribes to
   * (plus the node's own labeler, subscribed by default). Delegates to the shared,
   * non-DI query `feeds/post-batch.ts` also calls directly (see `label-lookup.ts`'s doc). */
  async labelsForPosts(
    postIds: readonly string[],
    viewerActorId: string | undefined,
  ): Promise<Map<string, LabelView[]>> {
    return lookupLabelsForPosts(this.dataSource.manager, postIds, viewerActorId);
  }

  private async requireLabeler(manager: EntityManager, labelerId: string): Promise<Labeler> {
    const labeler = await manager.getRepository(Labeler).findOne({ where: { id: labelerId } });
    if (labeler === null) throw new AppError('LABELER_NOT_FOUND', 'That labeler does not exist.');
    return labeler;
  }

  private async requireLabelerAuthority(
    manager: EntityManager,
    labeler: Labeler,
    actorId: string,
  ): Promise<void> {
    if (labeler.isNodeLabeler) {
      throw new AppError(
        'LABELER_FORBIDDEN',
        'The node’s own labeler is managed by node operators only.',
      );
    }
    if (labeler.actorId !== null) {
      if (labeler.actorId !== actorId) {
        throw new AppError('LABELER_FORBIDDEN', 'You do not operate this labeler.');
      }
      return;
    }
    if (labeler.communityId !== null) {
      await this.requireCommunityModerator(manager, labeler.communityId, actorId);
      return;
    }
    throw AppError.internal('Labeler has no owner.');
  }

  private async requireCommunityModerator(
    manager: EntityManager,
    communityId: string,
    actorId: string,
  ): Promise<void> {
    const member = await manager
      .getRepository(CommunityMember)
      .findOne({ where: { communityId, actorId } });
    if (member === null || member.role !== 'MODERATOR') {
      throw new AppError(
        'LABELER_FORBIDDEN',
        'You must be a moderator of this community to operate its labeler.',
      );
    }
  }

  private async requireActorExists(manager: EntityManager, actorId: string): Promise<Actor> {
    const actor = await manager.getRepository(Actor).findOne({ where: { id: actorId } });
    if (actor === null) throw new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
    return actor;
  }

  private async requirePostExists(manager: EntityManager, postId: string): Promise<Post> {
    const post = await manager.getRepository(Post).findOne({ where: { id: postId } });
    if (post === null) throw new AppError('POST_NOT_FOUND', 'That post does not exist.');
    return post;
  }

  private async toLabelerView(manager: EntityManager, row: Labeler): Promise<LabelerView> {
    const actor =
      row.actorId === null
        ? null
        : toActorSummary(await this.requireActorExists(manager, row.actorId));
    const community =
      row.communityId === null ? null : await this.communitySummaryOf(manager, row.communityId);
    return {
      id: row.id,
      actor,
      community,
      isNodeLabeler: row.isNodeLabeler,
      vocabulary: parseStoredVocabulary(row.vocabulary),
      createdAt: row.createdAt,
    };
  }

  private async communitySummaryOf(
    manager: EntityManager,
    communityId: string,
  ): Promise<CommunitySummaryView | null> {
    const row = await manager.getRepository(Community).findOne({ where: { id: communityId } });
    if (row === null) return null;
    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      description: row.description,
      rules: row.rules,
      isPublic: row.isPublic,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toLabelView(row: Label): LabelView {
    return {
      id: row.id,
      labelerId: row.labelerId,
      subjectType: row.subjectType,
      subjectActorId: row.subjectActorId,
      subjectPostId: row.subjectPostId,
      value: row.value,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      retractedAt: row.retractedAt,
    };
  }

  private async consumeRateLimit(key: string, windowMs: number, limit: number): Promise<void> {
    const count = await this.rateLimits.increment(key, windowMs, new Date());
    if (count > limit) {
      throw new AppError('RATE_LIMITED', 'Too many requests. Try again later.');
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
