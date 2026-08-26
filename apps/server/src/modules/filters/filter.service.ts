import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Filter,
  FilterScope as FilterScopeEntity,
  FilterTerm,
  type FilterAction as DbFilterAction,
  type FilterScopeValue as DbFilterScope,
  type FilterTermKind as DbFilterTermKind,
} from '@patches/database';
import { MAX_FILTERS_PER_ACTOR, RATE_LIMITS } from '@patches/domain';
import { timestampToDate, type Timestamp } from '@patches/proto';
import { type FilterAction, type FilterScope, type FilterTermKind } from '@patches/proto/nest';
import { In, type DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import {
  filterActionFromProto,
  filterScopeFromProto,
  filterTermKindFromProto,
} from './filter-enums.js';
import type { FilterListPage, FilterView } from './filter.dto.js';
import {
  parseDbFilterAction,
  parseDbFilterScope,
  parseDbFilterTermKind,
  parseFilterName,
  parseFilterScopes,
  parseFilterTerms,
  parseFilterUpdateMask,
  parseImportPayload,
  parseInput,
  uuidInputSchema,
  type ExportedFilter,
} from './validation.js';

interface ParsedNewFilter {
  name: string;
  terms: ReadonlyArray<{ kind: DbFilterTermKind; value: string }>;
  scopes: readonly DbFilterScope[];
  action: DbFilterAction;
  expiresAt: Date | null;
}

export interface FilterTermInputWire {
  kind: FilterTermKind;
  value: string;
}

export interface CreateFilterInput {
  actorId: string;
  name: string;
  terms: readonly FilterTermInputWire[];
  scopes: readonly FilterScope[];
  action: FilterAction;
  expiresAt: Timestamp | undefined;
}

export interface UpdateFilterInput {
  actorId: string;
  id: string;
  name: string;
  terms: readonly FilterTermInputWire[];
  scopes: readonly FilterScope[];
  action: FilterAction;
  expiresAt: Timestamp | undefined;
  updateMask: readonly string[];
}

/**
 * Application logic behind `patches.v1.FilterService` (spec §198): viewer-owned, subtractive
 * rules, literal terms only, portable via a plain JSON export/import. Evaluation against
 * timelines lives in `feeds/filter-matching.ts` and `feeds/feed.service.ts` — this service
 * only owns the CRUD/import/export surface.
 */
@Injectable()
export class FilterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimits: DbRateLimitStore,
  ) {}

  createFilter(input: CreateFilterInput): Promise<FilterView> {
    const parsed: ParsedNewFilter = {
      name: parseFilterName(input.name),
      terms: parseFilterTerms(
        input.terms.map((term) => ({
          kind: filterTermKindFromProto(term.kind),
          value: term.value,
        })),
      ),
      scopes: parseFilterScopes(input.scopes.map(filterScopeFromProto)),
      action: filterActionFromProto(input.action),
      expiresAt: timestampToDate(input.expiresAt) ?? null,
    };
    return this.persistNewFilter(input.actorId, parsed);
  }

  private async persistNewFilter(actorId: string, parsed: ParsedNewFilter): Promise<FilterView> {
    await this.consumeRateLimit(actorId);

    const filter = await this.dataSource.transaction(async (manager) => {
      const total = await manager.getRepository(Filter).countBy({ actorId });
      if (total >= MAX_FILTERS_PER_ACTOR) {
        throw AppError.validation(`You can have at most ${String(MAX_FILTERS_PER_ACTOR)} filters.`);
      }
      const created = await manager.getRepository(Filter).save(
        manager.getRepository(Filter).create({
          actorId,
          name: parsed.name,
          action: parsed.action,
          expiresAt: parsed.expiresAt,
        }),
      );
      await this.writeTermsAndScopes(manager, created.id, parsed.terms, parsed.scopes);
      return created;
    });

    return this.loadViewOrThrow(this.dataSource.manager, filter.id, actorId);
  }

  async updateFilter(input: UpdateFilterInput): Promise<FilterView> {
    const id = parseInput(uuidInputSchema, input.id);
    const mask = parseFilterUpdateMask(input.updateMask);

    await this.consumeRateLimit(input.actorId);

    await this.dataSource.transaction(async (manager) => {
      const filter = await this.requireOwnFilter(manager, id, input.actorId);
      const patch: Partial<Pick<Filter, 'name' | 'action' | 'expiresAt'>> = {};

      if (mask.has('name')) patch.name = parseFilterName(input.name);
      if (mask.has('action')) patch.action = filterActionFromProto(input.action);
      if (mask.has('expires_at')) patch.expiresAt = timestampToDate(input.expiresAt) ?? null;

      if (Object.keys(patch).length > 0) {
        await manager.getRepository(Filter).save(Object.assign(filter, patch));
      }

      if (mask.has('terms')) {
        const terms = parseFilterTerms(
          input.terms.map((term) => ({
            kind: filterTermKindFromProto(term.kind),
            value: term.value,
          })),
        );
        await manager.getRepository(FilterTerm).delete({ filterId: id });
        await manager
          .getRepository(FilterTerm)
          .save(
            terms.map((term) =>
              manager.getRepository(FilterTerm).create({ filterId: id, ...term }),
            ),
          );
      }

      if (mask.has('scopes')) {
        const scopes = parseFilterScopes(input.scopes.map(filterScopeFromProto));
        await manager.getRepository(FilterScopeEntity).delete({ filterId: id });
        await manager
          .getRepository(FilterScopeEntity)
          .save(
            scopes.map((scope) =>
              manager.getRepository(FilterScopeEntity).create({ filterId: id, scope }),
            ),
          );
      }
    });

    return this.loadViewOrThrow(this.dataSource.manager, id, input.actorId);
  }

  async deleteFilter(actorId: string, idRaw: string): Promise<void> {
    const id = parseInput(uuidInputSchema, idRaw);
    // Idempotent: deleting a filter that's already gone (or never the caller's) is a no-op,
    // matching every other feature module's delete/leave semantics — it never distinguishes
    // "not found" from "not yours" (§62).
    await this.dataSource.getRepository(Filter).delete({ id, actorId });
  }

  async listFilters(actorId: string, cursorRaw: string, limit: number): Promise<FilterListPage> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Filter)
      .createQueryBuilder('filter')
      .where('filter.actorId = :actorId', { actorId })
      .orderBy('filter.createdAt', 'DESC')
      .addOrderBy('filter.id', 'DESC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere('(filter.createdAt, filter.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const filters = await this.toViews(this.dataSource.manager, page);
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { filters, nextCursor, hasMore };
  }

  /** A plain, documented JSON export (spec §198.5) — never a binary blob or executable
   * format. Term ids are omitted; `ImportFilters` assigns new ones. */
  async exportFilters(actorId: string): Promise<string> {
    const filters = await this.dataSource.getRepository(Filter).find({ where: { actorId } });
    const views = await this.toViews(this.dataSource.manager, filters);
    const exported: ExportedFilter[] = views.map((view) => ({
      name: view.name,
      terms: view.terms.map((term) => ({ kind: term.kind, value: term.value })),
      scopes: view.scopes,
      action: view.action,
      expiresAt: view.expiresAt === null ? null : view.expiresAt.toISOString(),
    }));
    return JSON.stringify({ filters: exported });
  }

  /** Additive and previewable (spec §198.5): `apply = false` returns what would be added
   * without writing anything. Import never overwrites or removes an existing filter — a
   * duplicate-looking import just creates another filter, same as the client re-running
   * `CreateFilter` by hand would. */
  async importFilters(actorId: string, json: string, apply: boolean): Promise<FilterView[]> {
    const parsed = parseImportPayload(json);
    if (!apply) {
      return toPreviewViews(parsed);
    }

    const added: FilterView[] = [];
    for (const entry of parsed) {
      try {
        const parsedEntry: ParsedNewFilter = {
          name: parseFilterName(entry.name),
          terms: parseFilterTerms(
            entry.terms.map((term) => ({
              kind: parseDbFilterTermKind(term.kind),
              value: term.value,
            })),
          ),
          scopes: parseFilterScopes(entry.scopes.map(parseDbFilterScope)),
          action: parseDbFilterAction(entry.action),
          expiresAt: entry.expiresAt === null ? null : new Date(entry.expiresAt),
        };
        added.push(await this.persistNewFilter(actorId, parsedEntry));
      } catch (error) {
        // A single malformed/over-limit entry must not abort an otherwise-valid import; skip
        // it and keep going, matching §198.5's "additive" framing (nothing already imported is
        // rolled back by one bad entry later in the file).
        if (!(error instanceof AppError)) throw error;
      }
    }
    return added;
  }

  // ---------------------------------------------------------------- internals

  private async writeTermsAndScopes(
    manager: EntityManager,
    filterId: string,
    terms: ReadonlyArray<{ kind: DbFilterTermKind; value: string }>,
    scopes: readonly DbFilterScope[],
  ): Promise<void> {
    await manager
      .getRepository(FilterTerm)
      .save(terms.map((term) => manager.getRepository(FilterTerm).create({ filterId, ...term })));
    await manager
      .getRepository(FilterScopeEntity)
      .save(
        scopes.map((scope) => manager.getRepository(FilterScopeEntity).create({ filterId, scope })),
      );
  }

  private async requireOwnFilter(
    manager: EntityManager,
    id: string,
    actorId: string,
  ): Promise<Filter> {
    const filter = await manager.getRepository(Filter).findOne({ where: { id } });
    // Uniform not-found for a missing filter and one that belongs to someone else (§62) — a
    // filter's existence is itself sensitive (`filter.entity.ts`'s class doc).
    if (filter === null || filter.actorId !== actorId) {
      throw new AppError('FILTER_NOT_FOUND', 'That filter does not exist.');
    }
    return filter;
  }

  private async loadViewOrThrow(
    manager: EntityManager,
    id: string,
    actorId: string,
  ): Promise<FilterView> {
    const filter = await this.requireOwnFilter(manager, id, actorId);
    const [view] = await this.toViews(manager, [filter]);
    if (view === undefined) throw AppError.internal();
    return view;
  }

  private async toViews(manager: EntityManager, filters: readonly Filter[]): Promise<FilterView[]> {
    if (filters.length === 0) return [];
    const ids = filters.map((filter) => filter.id);
    const [terms, scopes] = await Promise.all([
      manager.getRepository(FilterTerm).find({ where: { filterId: In(ids) } }),
      manager.getRepository(FilterScopeEntity).find({ where: { filterId: In(ids) } }),
    ]);
    const termsByFilter = groupBy(terms, (row) => row.filterId);
    const scopesByFilter = groupBy(scopes, (row) => row.filterId);

    return filters.map((filter) => ({
      id: filter.id,
      name: filter.name,
      terms: (termsByFilter.get(filter.id) ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        value: row.value,
      })),
      scopes: (scopesByFilter.get(filter.id) ?? []).map((row) => row.scope),
      action: filter.action,
      expiresAt: filter.expiresAt,
      createdAt: filter.createdAt,
      updatedAt: filter.updatedAt,
    }));
  }

  private async consumeRateLimit(actorId: string): Promise<void> {
    const count = await this.rateLimits.increment(
      `filter_create_or_update:subject:${actorId}`,
      60 * 60_000,
      new Date(),
    );
    if (count > RATE_LIMITS.filterCreateOrUpdatePerHour) {
      throw new AppError('RATE_LIMITED', 'Too many filter changes. Try again later.');
    }
  }
}

function groupBy<Row, Key>(rows: readonly Row[], keyOf: (row: Row) => Key): Map<Key, Row[]> {
  const map = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

/**
 * `ImportFilters(apply=false)` renders a preview `Filter` per entry that would successfully
 * import, without ever writing — an entry that would be skipped by `apply=true` (an
 * unrecognized kind/scope/action, an over-limit term count, ...) is silently skipped here too,
 * so the preview never promises something the apply pass would not actually do. Synthetic ids
 * (never persisted, never collide with a real filter's id) let `toProtoFilter` map the
 * response uniformly.
 */
function toPreviewViews(entries: readonly ExportedFilter[]): FilterView[] {
  const previews: FilterView[] = [];
  entries.forEach((entry, index) => {
    try {
      const name = parseFilterName(entry.name);
      const terms = parseFilterTerms(
        entry.terms.map((term) => ({ kind: parseDbFilterTermKind(term.kind), value: term.value })),
      );
      const scopes = parseFilterScopes(entry.scopes.map(parseDbFilterScope));
      const action = parseDbFilterAction(entry.action);
      const expiresAt = entry.expiresAt === null ? null : new Date(entry.expiresAt);
      previews.push({
        id: `preview-${String(index)}`,
        name,
        terms: terms.map((term, termIndex) => ({
          id: `preview-${String(index)}-${String(termIndex)}`,
          kind: term.kind,
          value: term.value,
        })),
        scopes,
        action,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  });
  return previews;
}
