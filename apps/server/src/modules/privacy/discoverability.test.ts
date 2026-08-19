import { describe, expect, it, vi } from 'vitest';
import type { SelectQueryBuilder } from 'typeorm';

import {
  applyDiscoverableFilter,
  applyIndexableFilter,
  applyShowInLocalFeedFilter,
} from './discoverability.js';

/** A stub good enough for these helpers: they only ever call `qb.andWhere(sql)`. Same
 * `as unknown as` stubbing convention `node.service.test.ts` uses for TypeORM types that are
 * inconvenient to construct for real. */
function fakeQueryBuilder(): {
  andWhere: ReturnType<typeof vi.fn>;
  qb: SelectQueryBuilder<object>;
} {
  const andWhere = vi.fn();
  const qb = { andWhere } as unknown as SelectQueryBuilder<object>;
  return { andWhere, qb };
}

describe('applyDiscoverableFilter', () => {
  it('excludes actors with discoverable = false via NOT EXISTS, defaulting rowless actors to visible', () => {
    const { andWhere, qb } = fakeQueryBuilder();
    applyDiscoverableFilter(qb, '"actor"."id"');

    expect(andWhere).toHaveBeenCalledTimes(1);
    const [sql] = andWhere.mock.calls[0] as [string];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('FROM actor_privacy_prefs');
    expect(sql).toContain('discoverable_prefs.actor_id = "actor"."id"');
    expect(sql).toContain('discoverable_prefs.discoverable = false');
  });
});

describe('applyIndexableFilter', () => {
  it('filters on indexable against the given author column reference', () => {
    const { andWhere, qb } = fakeQueryBuilder();
    applyIndexableFilter(qb, '"post"."author_actor_id"');

    const [sql] = andWhere.mock.calls[0] as [string];
    expect(sql).toContain('indexable_prefs.actor_id = "post"."author_actor_id"');
    expect(sql).toContain('indexable_prefs.indexable = false');
  });
});

describe('applyShowInLocalFeedFilter', () => {
  it('filters on show_in_local_feed against the given author column reference', () => {
    const { andWhere, qb } = fakeQueryBuilder();
    applyShowInLocalFeedFilter(qb, '"post"."author_actor_id"');

    const [sql] = andWhere.mock.calls[0] as [string];
    expect(sql).toContain('local_feed_prefs.actor_id = "post"."author_actor_id"');
    expect(sql).toContain('local_feed_prefs.show_in_local_feed = false');
  });
});
