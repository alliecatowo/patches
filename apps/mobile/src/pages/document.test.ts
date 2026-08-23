import { describe, expect, it } from 'vitest';

import { decodePageDocument, normalizeHandle, resolveActiveSubPage } from './document.js';

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

const DOC = {
  version: 1,
  pages: [
    { slug: 'index', title: 'Home', blocks: [{ type: 'Text', body: 'hello' }] },
    { slug: 'about', title: '', blocks: [] },
  ],
};

describe('decodePageDocument', () => {
  it('decodes a valid document into a render view', () => {
    const view = decodePageDocument(encode(DOC));
    expect(view?.pages.map((subPage) => subPage.slug)).toEqual(['index', 'about']);
  });

  it('returns null for empty bytes (no page written yet)', () => {
    expect(decodePageDocument(new Uint8Array(0))).toBeNull();
  });

  it('returns null for bytes that are not JSON', () => {
    expect(decodePageDocument(new TextEncoder().encode('not json'))).toBeNull();
  });

  it('returns null for JSON that is not structurally a page document', () => {
    expect(decodePageDocument(encode({ no: 'version' }))).toBeNull();
  });

  it('degrades an unrecognized block type to an Unknown placeholder, never throws', () => {
    const view = decodePageDocument(
      encode({
        version: 1,
        pages: [{ slug: 'index', title: '', blocks: [{ type: 'Hologram', body: 'x' }] }],
      }),
    );
    expect(view?.pages[0]?.blocks).toEqual([{ type: 'Unknown', originalType: 'Hologram' }]);
  });
});

describe('resolveActiveSubPage', () => {
  const view = decodePageDocument(encode(DOC));
  if (view === null) throw new Error('fixture failed to decode');

  it('matches the server-reported active slug', () => {
    expect(resolveActiveSubPage(view, 'about')?.slug).toBe('about');
  });

  it('falls back to the first sub-page when the slug does not match', () => {
    expect(resolveActiveSubPage(view, 'missing')?.slug).toBe('index');
  });

  it('returns null when the document has no sub-pages', () => {
    const empty = decodePageDocument(encode({ version: 1, pages: [] }));
    if (empty === null) throw new Error('fixture failed to decode');
    expect(resolveActiveSubPage(empty, 'index')).toBeNull();
  });
});

describe('normalizeHandle', () => {
  it('strips a leading @ and surrounding whitespace', () => {
    expect(normalizeHandle('@mrb')).toBe('mrb');
    expect(normalizeHandle('  @mrb ')).toBe('mrb');
    expect(normalizeHandle('mrb')).toBe('mrb');
  });

  it('leaves handles without a leading @ untouched', () => {
    expect(normalizeHandle('mrb@remote')).toBe('mrb@remote');
  });
});
