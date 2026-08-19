import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Community,
  CommunityMember,
  FilterList,
  FilterListEntry,
  FilterListException,
  FilterListSubscription,
  type FilterAction as DbFilterAction,
} from '@patches/database';
import {
  MAX_FILTER_LIST_EXCEPTIONS_PER_LIST,
  MAX_FILTER_LIST_SUBSCRIPTIONS,
  MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR,
  RATE_LIMITS,
} from '@patches/domain';
import { In, type DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { filterTermKindFromProto } from '../filters/filter-enums.js';
import type { FilterTermInputWire } from '../filters/filter.service.js';
import { parseFilterTerms } from '../filters/validation.js';
import type {
  FilterListCommunityOwnerView,
  FilterListEntryListPage,
  FilterListListPage,
  FilterListSubscriptionListPage,
  FilterListSubscriptionView,
  FilterListView,
} from './filter-list.dto.js';
import {
  parseFilterListDescription,
  parseFilterListDisplayName,
  parseFilterListEntries,
  parseFilterListName,
  parseFilterListUpdateMask,
  parseInput,
  uuidInputSchema,
} from './validation.js';

export interface PublishFilterListInput {
  actorId: string;
  name: string;
  displayName: string;
  description: string;
  ownerCommunityId: string;
  entries: readonly FilterTermInputWire[];
}

export interface UpdateFilterListInput {
  actorId: string;
  id: string;
  displayName: string;
  description: string;
  entries: readonly FilterTermInputWire[];
  updateMask: readonly string[];
}

/**
 * Application logic behind `patches.v1.FilterListService` (spec §199): the decentralized,
 * publish/subscribe primitive. The subscriber owns the action, the list author owns the
 * entries, and a subscription never creates a block (§199.2) — this service enforces that
 * split; `feeds/filter-matching.ts` is what actually evaluates a subscription against a
 * timeline.
 */
@Injectable()
export class FilterListService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimits: DbRateLimitStore,
  ) {}

  async publishFilterList(input: PublishFilterListInput): Promise<FilterListView> {
    const name = parseFilterListName(input.name);
    const displayName = parseFilterListDisplayName(input.displayName);
    const description = parseFilterListDescription(input.description);
    const entries = parseFilterListEntries(
      parseFilterTerms(
        input.entries.map((entry) => ({
          kind: filterTermKindFromProto(entry.kind),
          value: entry.value,
        })),
      ),
    );
    const ownerCommunityId =
      input.ownerCommunityId.length === 0
        ? null
        : parseInput(uuidInputSchema, input.ownerCommunityId);

    await this.consumeRateLimit(input.actorId);

    const filterList = await this.dataSource.transaction(async (manager) => {
      if (ownerCommunityId !== null) {
        await this.requireCommunityModerator(manager, ownerCommunityId, input.actorId);
      }

      const total = await manager
        .getRepository(FilterList)
        .countBy(
          ownerCommunityId === null ? { ownerActorId: input.actorId } : { ownerCommunityId },
        );
      if (total >= MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR) {
        throw AppError.validation(
          `At most ${String(MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR)} filter lists may be published per owner.`,
        );
      }

      let created: FilterList;
      try {
        created = await manager.getRepository(FilterList).save(
          manager.getRepository(FilterList).create({
            ownerActorId: ownerCommunityId === null ? input.actorId : null,
            ownerCommunityId,
            name,
            displayName,
            description,
          }),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw AppError.validation('That name is already used by one of this owner’s filter lists.');
      }

      await manager
        .getRepository(FilterListEntry)
        .save(
          entries.map((entry) =>
            manager.getRepository(FilterListEntry).create({ filterListId: created.id, ...entry }),
          ),
        );
      return created;
    });

    return this.loadViewOrThrow(this.dataSource.manager, filterList.id);
  }

  async updateFilterList(input: UpdateFilterListInput): Promise<FilterListView> {
    const id = parseInput(uuidInputSchema, input.id);
    const mask = parseFilterListUpdateMask(input.updateMask);

    await this.consumeRateLimit(input.actorId);

    await this.dataSource.transaction(async (manager) => {
      const filterList = await this.loadFilterListOrThrow(manager, id);
      await this.requireOwnerOrModerator(manager, filterList, input.actorId);

      const patch: Partial<Pick<FilterList, 'displayName' | 'description'>> = {};
      if (mask.has('display_name'))
        patch.displayName = parseFilterListDisplayName(input.displayName);
      if (mask.has('description'))
        patch.description = parseFilterListDescription(input.description);
      if (Object.keys(patch).length > 0) {
        await manager.getRepository(FilterList).save(Object.assign(filterList, patch));
      }

      if (mask.has('entries')) {
        const entries = parseFilterListEntries(
          parseFilterTerms(
            input.entries.map((entry) => ({
              kind: filterTermKindFromProto(entry.kind),
              value: entry.value,
            })),
          ),
        );
        await manager.getRepository(FilterListEntry).delete({ filterListId: id });
        await manager
          .getRepository(FilterListEntry)
          .save(
            entries.map((entry) =>
              manager.getRepository(FilterListEntry).create({ filterListId: id, ...entry }),
            ),
          );
      }
    });

    return this.loadViewOrThrow(this.dataSource.manager, id);
  }

  async deleteFilterList(actorId: string, idRaw: string): Promise<void> {
    const id = parseInput(uuidInputSchema, idRaw);
    await this.dataSource.transaction(async (manager) => {
      const filterList = await manager.getRepository(FilterList).findOne({ where: { id } });
      // Idempotent: a list that's already gone is a no-op, same as `FilterService.DeleteFilter`.
      if (filterList === null) return;
      await this.requireOwnerOrModerator(manager, filterList, actorId);
      await manager.getRepository(FilterList).delete({ id });
    });
  }

  async getFilterList(idRaw: string): Promise<FilterListView> {
    const id = parseInput(uuidInputSchema, idRaw);
    return this.loadViewOrThrow(this.dataSource.manager, id);
  }

  /** Public by construction (spec §199.1) — no viewer gate. `ownerActorIdRaw` empty lists
   * every published list; set, it scopes to one publisher's lists. */
  async listFilterLists(
    ownerActorIdRaw: string,
    cursorRaw: string,
    limit: number,
  ): Promise<FilterListListPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(FilterList)
      .createQueryBuilder('filterList')
      .orderBy('filterList.updatedAt', 'DESC')
      .addOrderBy('filterList.id', 'DESC')
      .take(take + 1);
    if (ownerActorIdRaw.length > 0) {
      const ownerActorId = parseInput(uuidInputSchema, ownerActorIdRaw);
      qb.andWhere('filterList.ownerActorId = :ownerActorId', { ownerActorId });
    }
    if (cursor !== undefined) {
      qb.andWhere('(filterList.updatedAt, filterList.id) < (:cursorUpdatedAt, :cursorId)', {
        cursorUpdatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const filterLists = await this.toViews(this.dataSource.manager, page);
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.updatedAt,
      id: row.id,
    }));
    return { filterLists, nextCursor, hasMore };
  }

  /** The full entry set, visible to anyone (spec §199.1's "public by construction", §199.3's
   * "an unauditable list is a black box with authority"). */
  async listFilterListEntries(
    filterListIdRaw: string,
    cursorRaw: string,
    limit: number,
  ): Promise<FilterListEntryListPage> {
    const filterListId = parseInput(uuidInputSchema, filterListIdRaw);
    await this.loadFilterListOrThrow(this.dataSource.manager, filterListId);

    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);
    const qb = this.dataSource
      .getRepository(FilterListEntry)
      .createQueryBuilder('entry')
      .where('entry.filterListId = :filterListId', { filterListId })
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere('(entry.createdAt, entry.id) < (:cursorCreatedAt, :cursorId)', {
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
    return {
      entries: page.map((row) => ({
        id: row.id,
        kind: row.kind,
        value: row.value,
        createdAt: row.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  /** Upsert: subscribing again with a different action updates the existing subscription
   * rather than erroring — an actor is subscribed to a list or not, never twice (the
   * `filter_list_subscriptions` composite PK). Never creates a block (spec §199.2, §208). */
  async subscribeFilterList(
    actorId: string,
    filterListIdRaw: string,
    action: DbFilterAction,
  ): Promise<FilterListSubscriptionView> {
    const filterListId = parseInput(uuidInputSchema, filterListIdRaw);
    await this.loadFilterListOrThrow(this.dataSource.manager, filterListId);

    await this.consumeSubscribeRateLimit(actorId);

    await this.dataSource.transaction(async (manager) => {
      const subscriptions = manager.getRepository(FilterListSubscription);
      const existing = await subscriptions.findOne({ where: { actorId, filterListId } });
      if (existing !== null) {
        existing.action = action;
        await subscriptions.save(existing);
        return;
      }
      const total = await subscriptions.countBy({ actorId });
      if (total >= MAX_FILTER_LIST_SUBSCRIPTIONS) {
        throw AppError.validation(
          `You can subscribe to at most ${String(MAX_FILTER_LIST_SUBSCRIPTIONS)} filter lists.`,
        );
      }
      try {
        await subscriptions.save(subscriptions.create({ actorId, filterListId, action }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    });

    const view = await this.loadSubscriptionView(this.dataSource.manager, actorId, filterListId);
    if (view === null) throw AppError.internal();
    return view;
  }

  /** Instant and complete (spec §199.3): also clears the caller's per-entry exceptions on this
   * list, so a later re-subscribe never silently inherits a stale exception set. */
  async unsubscribeFilterList(actorId: string, filterListIdRaw: string): Promise<void> {
    const filterListId = parseInput(uuidInputSchema, filterListIdRaw);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(FilterListSubscription).delete({ actorId, filterListId });
      await manager.getRepository(FilterListException).delete({ actorId, filterListId });
    });
  }

  async listFilterListSubscriptions(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<FilterListSubscriptionListPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);
    const qb = this.dataSource
      .getRepository(FilterListSubscription)
      .createQueryBuilder('subscription')
      .where('subscription.actorId = :actorId', { actorId })
      .orderBy('subscription.createdAt', 'DESC')
      .addOrderBy('subscription.filterListId', 'DESC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere(
        '(subscription.createdAt, subscription.filterListId) < (:cursorCreatedAt, :cursorId)',
        {
          cursorCreatedAt: cursor.createdAt,
          cursorId: cursor.id,
        },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const filterListViews = await this.toViews(
      this.dataSource.manager,
      await this.dataSource.getRepository(FilterList).find({
        where: { id: In(page.map((row) => row.filterListId)) },
      }),
    );
    const filterListById = new Map(filterListViews.map((view) => [view.id, view]));
    const subscriptions: FilterListSubscriptionView[] = [];
    for (const row of page) {
      const filterList = filterListById.get(row.filterListId);
      if (filterList === undefined) continue;
      subscriptions.push({ filterList, action: row.action, createdAt: row.createdAt });
    }
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.filterListId,
    }));
    return { subscriptions, nextCursor, hasMore };
  }

  /** Per-entry opt-out (spec §199.3) — never unsubscribes and never notifies the list author.
   * `excepted = true` adds it (bounded, {@link MAX_FILTER_LIST_EXCEPTIONS_PER_LIST}),
   * `excepted = false` removes it; both are idempotent. Requires an active subscription to
   * that list — an exception on a list the caller isn't subscribed to has no meaning to
   * except from. */
  async setFilterListEntryException(
    actorId: string,
    filterListIdRaw: string,
    filterListEntryIdRaw: string,
    excepted: boolean,
  ): Promise<void> {
    const filterListId = parseInput(uuidInputSchema, filterListIdRaw);
    const filterListEntryId = parseInput(uuidInputSchema, filterListEntryIdRaw);

    await this.dataSource.transaction(async (manager) => {
      const subscribed = await manager
        .getRepository(FilterListSubscription)
        .exists({ where: { actorId, filterListId } });
      if (!subscribed) {
        throw AppError.validation('You are not subscribed to that filter list.');
      }
      const entry = await manager
        .getRepository(FilterListEntry)
        .findOne({ where: { id: filterListEntryId, filterListId } });
      if (entry === null) {
        throw new AppError('FILTER_LIST_ENTRY_NOT_FOUND', 'That filter list entry does not exist.');
      }

      const exceptions = manager.getRepository(FilterListException);
      if (!excepted) {
        await exceptions.delete({ actorId, filterListId, filterListEntryId });
        return;
      }
      const existing = await exceptions.findOne({
        where: { actorId, filterListId, filterListEntryId },
      });
      if (existing !== null) return;
      const total = await exceptions.countBy({ actorId, filterListId });
      if (total >= MAX_FILTER_LIST_EXCEPTIONS_PER_LIST) {
        throw AppError.validation(
          `You can set at most ${String(MAX_FILTER_LIST_EXCEPTIONS_PER_LIST)} exceptions per filter list.`,
        );
      }
      try {
        await exceptions.save(exceptions.create({ actorId, filterListId, filterListEntryId }));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    });
  }

  // ---------------------------------------------------------------- internals

  private async loadFilterListOrThrow(manager: EntityManager, id: string): Promise<FilterList> {
    const filterList = await manager.getRepository(FilterList).findOne({ where: { id } });
    if (filterList === null) {
      throw new AppError('FILTER_LIST_NOT_FOUND', 'That filter list does not exist.');
    }
    return filterList;
  }

  private async requireOwnerOrModerator(
    manager: EntityManager,
    filterList: FilterList,
    actorId: string,
  ): Promise<void> {
    if (filterList.ownerActorId !== null) {
      if (filterList.ownerActorId !== actorId) {
        throw new AppError('FILTER_LIST_FORBIDDEN', 'You do not own that filter list.');
      }
      return;
    }
    if (filterList.ownerCommunityId !== null) {
      await this.requireCommunityModerator(manager, filterList.ownerCommunityId, actorId);
    }
  }

  private async requireCommunityModerator(
    manager: EntityManager,
    communityId: string,
    actorId: string,
  ): Promise<void> {
    const community = await manager
      .getRepository(Community)
      .findOne({ where: { id: communityId } });
    if (community === null) throw AppError.validation('That community does not exist.');
    const member = await manager
      .getRepository(CommunityMember)
      .findOne({ where: { communityId, actorId } });
    if (member === null || member.role !== 'MODERATOR') {
      throw new AppError(
        'FILTER_LIST_FORBIDDEN',
        'You must be a moderator of that community to do that.',
      );
    }
  }

  private async loadViewOrThrow(manager: EntityManager, id: string): Promise<FilterListView> {
    const filterList = await this.loadFilterListOrThrow(manager, id);
    const [view] = await this.toViews(manager, [filterList]);
    if (view === undefined) throw AppError.internal();
    return view;
  }

  private async loadSubscriptionView(
    manager: EntityManager,
    actorId: string,
    filterListId: string,
  ): Promise<FilterListSubscriptionView | null> {
    const subscription = await manager
      .getRepository(FilterListSubscription)
      .findOne({ where: { actorId, filterListId } });
    if (subscription === null) return null;
    const filterList = await this.loadViewOrThrow(manager, filterListId);
    return { filterList, action: subscription.action, createdAt: subscription.createdAt };
  }

  private async toViews(
    manager: EntityManager,
    filterLists: readonly FilterList[],
  ): Promise<FilterListView[]> {
    if (filterLists.length === 0) return [];
    const actorIds = filterLists.flatMap((row) =>
      row.ownerActorId === null ? [] : [row.ownerActorId],
    );
    const communityIds = filterLists.flatMap((row) =>
      row.ownerCommunityId === null ? [] : [row.ownerCommunityId],
    );
    const [actors, communities] = await Promise.all([
      actorIds.length === 0
        ? Promise.resolve([])
        : manager.getRepository(Actor).find({ where: { id: In(actorIds) } }),
      communityIds.length === 0
        ? Promise.resolve([])
        : manager.getRepository(Community).find({ where: { id: In(communityIds) } }),
    ]);
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const communityById = new Map(communities.map((community) => [community.id, community]));

    return filterLists.map((row) => ({
      id: row.id,
      ownerActor:
        row.ownerActorId === null
          ? null
          : actorById.has(row.ownerActorId)
            ? toActorSummary(actorById.get(row.ownerActorId)!)
            : null,
      ownerCommunity:
        row.ownerCommunityId === null
          ? null
          : toCommunityOwnerView(communityById.get(row.ownerCommunityId)),
      name: row.name,
      displayName: row.displayName,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private async consumeRateLimit(actorId: string): Promise<void> {
    const count = await this.rateLimits.increment(
      `filter_list_publish_or_update:subject:${actorId}`,
      60 * 60_000,
      new Date(),
    );
    if (count > RATE_LIMITS.filterListPublishOrUpdatePerHour) {
      throw new AppError('RATE_LIMITED', 'Too many filter list changes. Try again later.');
    }
  }

  private async consumeSubscribeRateLimit(actorId: string): Promise<void> {
    const count = await this.rateLimits.increment(
      `filter_list_subscribe:subject:${actorId}`,
      60 * 60_000,
      new Date(),
    );
    if (count > RATE_LIMITS.filterListSubscribePerHour) {
      throw new AppError('RATE_LIMITED', 'Too many subscription changes. Try again later.');
    }
  }
}

function toCommunityOwnerView(
  community: Community | undefined,
): FilterListCommunityOwnerView | null {
  if (community === undefined) return null;
  return {
    id: community.id,
    name: community.name,
    displayName: community.displayName,
    description: community.description,
    rules: community.rules,
    isPublic: community.isPublic,
    createdAt: community.createdAt,
    updatedAt: community.updatedAt,
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
