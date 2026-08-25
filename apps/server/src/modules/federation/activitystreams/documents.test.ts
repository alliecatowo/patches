import { describe, expect, it } from 'vitest';

import {
  buildActivity,
  buildNoteObject,
  buildOutboxPage,
  type LocalNoteInput,
} from './documents.js';

/** P18-006 (ADR 0028 §3): outbound tags + quotes are **strictly additive** — a note with no
 * tags and no quote serializes to exactly the pre-P18-006 shape, and every new property is
 * deterministic (byte-stable across re-serializations) because peers and our own outbox
 * pages re-read these documents. */

const BASE: LocalNoteInput = {
  id: 'https://local.test/posts/00000000-0000-4000-8000-000000000001',
  attributedTo: 'https://local.test/users/alice',
  content: 'hello',
  published: new Date('2026-08-23T00:00:00Z'),
  inReplyTo: null,
  followersUri: 'https://local.test/users/alice/followers',
};

describe('buildNoteObject — outbound tags (P18-006)', () => {
  it('emits one as:Hashtag per tag with a #-prefixed name and a deterministic fragment id', () => {
    const doc = buildNoteObject({
      ...BASE,
      tags: [
        { name: 'cats', href: null },
        { name: 'dogs', href: 'https://local.test/tags/dogs' },
      ],
    });

    expect(doc.tag).toEqual([
      {
        type: 'Hashtag',
        name: '#cats',
        id: `${BASE.id}#tag-cats`,
        // href omitted (prune), not explicit null — the node has no tag page for it.
      },
      {
        type: 'Hashtag',
        name: '#dogs',
        id: `${BASE.id}#tag-dogs`,
        href: 'https://local.test/tags/dogs',
      },
    ]);
  });

  it('omits the tag property entirely for a post with no tags (pre-P18-006 shape)', () => {
    expect('tag' in buildNoteObject(BASE)).toBe(false);
    expect('tag' in buildNoteObject({ ...BASE, tags: [] })).toBe(false);
  });

  it('re-serializes byte-identically for the same inputs (retry/outbox stability)', () => {
    const input: LocalNoteInput = {
      ...BASE,
      tags: [{ name: 'cats', href: null }],
      quoteUri: 'https://remote.test/notes/9',
      quotePolicy: 'FOLLOWERS',
    };
    expect(buildNoteObject(input)).toEqual(buildNoteObject(input));
  });
});

describe('buildNoteObject — outbound quote linkage (P18-006, ADR 0028 §3)', () => {
  it('emits FEP-044f quote plus all three legacy fallback properties, same URI', () => {
    const doc = buildNoteObject({ ...BASE, quoteUri: 'https://remote.test/notes/9' });

    expect(doc.quote).toBe('https://remote.test/notes/9');
    expect(doc.quoteUri).toBe('https://remote.test/notes/9');
    expect(doc.quoteUrl).toBe('https://remote.test/notes/9');
    expect(doc._misskey_quote).toBe('https://remote.test/notes/9');
  });

  it('emits no quote property for a plain post', () => {
    const doc = buildNoteObject(BASE);
    for (const key of ['quote', 'quoteUri', 'quoteUrl', '_misskey_quote']) {
      expect(key in doc).toBe(false);
    }
  });
});

describe('buildNoteObject — quote_policy → interaction policy (P18-006)', () => {
  it('maps ANYONE to the as:Public audience', () => {
    const doc = buildNoteObject({ ...BASE, quotePolicy: 'ANYONE' });
    expect(doc.interactionPolicy).toEqual({
      id: `${BASE.id}#interaction-policy`,
      canQuote: 'https://www.w3.org/ns/activitystreams#Public',
    });
  });

  it('maps FOLLOWERS to the author’s followers collection URI', () => {
    const doc = buildNoteObject({ ...BASE, quotePolicy: 'FOLLOWERS' });
    expect(doc.interactionPolicy).toEqual({
      id: `${BASE.id}#interaction-policy`,
      canQuote: BASE.followersUri,
    });
  });

  it('maps NOBODY to the author’s own actor URI (self-quotes only)', () => {
    const doc = buildNoteObject({ ...BASE, quotePolicy: 'NOBODY' });
    expect(doc.interactionPolicy).toEqual({
      id: `${BASE.id}#interaction-policy`,
      canQuote: BASE.attributedTo,
    });
  });

  it('omits interactionPolicy when the caller passes no policy (pre-P18-006 shape)', () => {
    expect('interactionPolicy' in buildNoteObject(BASE)).toBe(false);
  });

  it('never emits a `following` audience value', () => {
    for (const quotePolicy of ['ANYONE', 'FOLLOWERS', 'NOBODY'] as const) {
      const doc = buildNoteObject({ ...BASE, quotePolicy });
      const policy = doc.interactionPolicy as { canQuote: string };
      expect(policy.canQuote).not.toContain('following');
    }
  });
});

describe('buildNoteObject — pre-existing shape is unchanged (regression)', () => {
  it('serializes the same fields as before for a plain note', () => {
    expect(buildNoteObject(BASE)).toEqual({
      id: BASE.id,
      type: 'Note',
      attributedTo: BASE.attributedTo,
      content: 'hello',
      published: '2026-08-23T00:00:00.000Z',
      inReplyTo: null,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [BASE.followersUri],
    });
  });

  it('still nests cleanly inside buildActivity/buildOutboxPage documents', () => {
    const activity = buildActivity({
      id: 'https://local.test/activities/1',
      type: 'Create',
      actor: BASE.attributedTo,
      object: buildNoteObject(BASE),
    });
    const page = buildOutboxPage({
      id: 'https://local.test/users/alice/outbox?page=true',
      partOf: 'https://local.test/users/alice/outbox',
      items: [buildNoteObject(BASE)],
    });
    expect((activity.object as Record<string, unknown>).type).toBe('Note');
    expect(Array.isArray(page.orderedItems)).toBe(true);
  });
});
