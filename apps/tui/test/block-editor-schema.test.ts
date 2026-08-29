import { describe, expect, it } from 'vitest';

import {
  applyLinkListEntries,
  applyFieldText,
  blankLinkListEntry,
  BLOCK_TYPE_SPECS,
  getBlockTypeSpec,
  readLinkList,
  type LinkListEntry,
} from '../src/pages/block-editor-schema.js';

/**
 * B-119 — the `Links` block's entries are edited through the new `'linkList'` field
 * kind in the structured Pages editor (`PageBlocksEditorScreen`). The screen builds and
 * commits that array through the pure helpers below; the editor UI tests in
 * `page-blocks-editor.test.tsx` exercise the keyboard affordances on top of these.
 */

describe('Links linkList field schema (B-119)', () => {
  it('the Links spec exposes label/href/group entry fields', () => {
    const spec = getBlockTypeSpec('Links');
    expect(spec).toBeDefined();
    const linkList = spec?.fields.find((field) => field.kind === 'linkList');
    expect(linkList?.entryFields?.map((field) => field.key)).toEqual(['label', 'href', 'group']);
    // Group is optional (a blank group must not render a stray heading) and capped.
    const group = linkList?.entryFields?.find((field) => field.key === 'group');
    expect(group?.optional).toBe(true);
    expect(group?.maxChars).toBeGreaterThan(0);
  });

  it('readLinkList tolerates missing, partial, and non-array values on a draft', () => {
    expect(readLinkList({}, 'links')).toEqual([]);
    expect(readLinkList({ links: 'not-an-array' }, 'links')).toEqual([]);
    expect(
      readLinkList({ links: [{ label: 'x', href: 'https://x.example' }, null] }, 'links'),
    ).toEqual([
      { label: 'x', href: 'https://x.example', group: '' },
      { label: '', href: '', group: '' },
    ]);
    // Non-string fields read as '' rather than throwing.
    expect(readLinkList({ links: [{ label: 7, href: true }] }, 'links')).toEqual([
      { label: '', href: '', group: '' },
    ]);
  });

  it('applyLinkListEntries commits entries in order and drops a blank group key', () => {
    const raw: Record<string, unknown> = { type: 'Links' };
    const entries: LinkListEntry[] = [
      { label: 'Patches', href: 'https://patches.example', group: 'Top' },
      { label: 'None', href: 'https://none.example', group: '   ' },
      { label: 'Docs', href: 'https://docs.example', group: '' },
    ];
    const next = applyLinkListEntries(raw, 'links', entries, undefined);
    expect(next).toEqual({
      type: 'Links',
      links: [
        { label: 'Patches', href: 'https://patches.example', group: 'Top' },
        { label: 'None', href: 'https://none.example' },
        { label: 'Docs', href: 'https://docs.example' },
      ],
    });
    // The original raw object is never mutated.
    expect(raw).toEqual({ type: 'Links' });
  });

  it('applyLinkListEntries caps the list at maxItems', () => {
    const entries: LinkListEntry[] = [
      { label: 'a', href: 'https://a.example', group: '' },
      { label: 'b', href: 'https://b.example', group: '' },
      { label: 'c', href: 'https://c.example', group: '' },
    ];
    const next = applyLinkListEntries({}, 'links', entries, 2);
    expect(next.links as unknown[]).toHaveLength(2);
  });

  it('blankLinkListEntry yields an editable empty entry', () => {
    expect(blankLinkListEntry()).toEqual({ label: '', href: '', group: '' });
  });

  it('applyFieldText is a no-op for linkList fields (committed via applyLinkListEntries)', () => {
    const spec = BLOCK_TYPE_SPECS.find((candidate) => candidate.type === 'Links')!;
    const linkList = spec.fields.find((field) => field.kind === 'linkList')!;
    const raw = { type: 'Links', links: [{ label: 'x', href: 'https://x.example' }] };
    expect(applyFieldText(linkList, raw, 'anything')).toEqual(raw);
  });
});
