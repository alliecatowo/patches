import {
  FILTER_ACTION,
  FILTERED_BY_PROVENANCE,
  type Actor,
  type FilteredByHint,
} from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { describeFilteredBy } from './filtered-by.js';

function actor(handle: string): Actor {
  return {
    id: 'actor-1',
    handle,
    displayName: '',
    bio: '',
    avatarUrl: '',
    createdAt: undefined,
    locationText: '',
    websiteUrl: '',
    counts: undefined,
    nameplate: undefined,
    domain: '',
    isRemote: false,
    labels: [],
  } as unknown as Actor;
}

describe('describeFilteredBy', () => {
  it('returns undefined for a null hint (proto-loader unset shape)', () => {
    expect(describeFilteredBy(null)).toBeUndefined();
  });

  it('returns undefined for an undefined hint', () => {
    expect(describeFilteredBy(undefined)).toBeUndefined();
  });

  it('returns undefined for an unspecified provenance', () => {
    const hint: FilteredByHint = {
      provenance: FILTERED_BY_PROVENANCE.UNSPECIFIED,
      name: 'Spoilers',
      listOwner: undefined,
      action: FILTER_ACTION.COLLAPSE,
    };
    expect(describeFilteredBy(hint)).toBeUndefined();
  });

  it('renders a bare filter without a "via" suffix', () => {
    const hint: FilteredByHint = {
      provenance: FILTERED_BY_PROVENANCE.FILTER,
      name: 'Spoilers',
      listOwner: undefined,
      action: FILTER_ACTION.COLLAPSE,
    };
    expect(describeFilteredBy(hint)).toBe('filtered: Spoilers');
  });

  it('renders a filter-list match with the publisher handle', () => {
    const hint: FilteredByHint = {
      provenance: FILTERED_BY_PROVENANCE.FILTER_LIST,
      name: 'Curated blocklist',
      listOwner: actor('alice'),
      action: FILTER_ACTION.WARN,
    };
    expect(describeFilteredBy(hint)).toBe('filtered: Curated blocklist (via @alice)');
  });

  it('falls back to no suffix when a filter-list hint has no list_owner', () => {
    const hint: FilteredByHint = {
      provenance: FILTERED_BY_PROVENANCE.FILTER_LIST,
      name: 'Curated blocklist',
      listOwner: null as unknown as undefined,
      action: FILTER_ACTION.WARN,
    };
    expect(describeFilteredBy(hint)).toBe('filtered: Curated blocklist');
  });

  it('strips terminal control sequences from the name and handle', () => {
    const hint: FilteredByHint = {
      provenance: FILTERED_BY_PROVENANCE.FILTER_LIST,
      name: 'x\x1b[2Jy',
      listOwner: actor('a\x1b[2Jb'),
      action: FILTER_ACTION.COLLAPSE,
    };
    expect(describeFilteredBy(hint)).toBe('filtered: x[2Jy (via @a[2Jb)');
  });
});
