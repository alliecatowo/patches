import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PAGE_MAX_BLOCKS_PER_PAGE, PAGE_MAX_SUBPAGES } from './limits.js';
import {
  isPageValidationError,
  parsePageForRender,
  parsePageLenient,
  parsePageStrict,
  PageValidationError,
  serializePage,
} from './page.js';

const ESC = String.fromCharCode(0x1b);

/** Builds a base document as `unknown` (not typed `PatchesPage`) — most of this suite feeds
 * it deliberately malformed overrides (bad block types, extra fields, wrong version) to
 * exercise `parsePageStrict`'s rejection paths, which a `Partial<PatchesPage>` parameter
 * couldn't express. */
function minimalDoc(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    pages: [{ slug: 'index', title: 'home', blocks: [{ type: 'Text', body: 'hello' }] }],
    ...overrides,
  };
}

describe('parsePageStrict', () => {
  it('accepts a minimal valid document', () => {
    const doc = parsePageStrict(minimalDoc());
    expect(doc.version).toBe(1);
    expect(doc.pages[0]?.slug).toBe('index');
  });

  it('accepts every known block type', () => {
    const mediaId = randomUUID();
    const doc = parsePageStrict({
      version: 1,
      theme: { accent: '#c678dd', border: 'round' },
      pages: [
        {
          slug: 'index',
          title: 'home',
          blocks: [
            { type: 'Text', body: 'hi' },
            { type: 'Markdown', body: '# hi' },
            { type: 'Image', mediaId, alt: 'a photo' },
            { type: 'Links', links: [{ label: 'blog', href: 'https://example.com' }] },
            { type: 'Posts', limit: 10 },
            { type: 'Gallery', mediaIds: [mediaId] },
            { type: 'Friends' },
            { type: 'TopEight', actors: ['@bob', '@carol@other.node'] },
            { type: 'Guestbook', limit: 20 },
            { type: 'NowPlaying', text: 'techno' },
            { type: 'Badges' },
            { type: 'AsciiArt', art: '(-_-)' },
            { type: 'Spacer', size: 'md' },
            { type: 'Hero', title: 'hi', subtitle: 'welcome' },
          ],
        },
      ],
    });
    expect(doc.pages[0]?.blocks).toHaveLength(14);
  });

  it('rejects a missing version', () => {
    expect(() => parsePageStrict(minimalDoc({ version: undefined }))).toThrow(PageValidationError);
  });

  it('rejects an unsupported version', () => {
    expect(() => parsePageStrict(minimalDoc({ version: 2 }))).toThrow(PageValidationError);
  });

  it('rejects an unknown block type on write', () => {
    expect(() =>
      parsePageStrict(
        minimalDoc({
          pages: [{ slug: 'index', title: 'home', blocks: [{ type: 'ExecuteScript' }] }],
        }),
      ),
    ).toThrow(PageValidationError);
  });

  it('rejects unknown fields on a known block (strict-on-write)', () => {
    expect(() =>
      parsePageStrict(
        minimalDoc({
          pages: [
            {
              slug: 'index',
              title: 'home',
              blocks: [{ type: 'Text', body: 'hi', onClick: 'alert(1)' }],
            },
          ],
        }),
      ),
    ).toThrow(PageValidationError);
  });

  it('rejects unknown top-level fields (strict-on-write)', () => {
    expect(() => parsePageStrict(minimalDoc({ evil: true }))).toThrow(PageValidationError);
  });

  it('rejects more than the sub-page limit', () => {
    const pages = Array.from({ length: PAGE_MAX_SUBPAGES + 1 }, (_, i) => ({
      slug: `page-${String(i)}`,
      title: 'x',
      blocks: [],
    }));
    expect(() => parsePageStrict(minimalDoc({ pages }))).toThrow(PageValidationError);
  });

  it('rejects more than the blocks-per-page limit', () => {
    const blocks = Array.from({ length: PAGE_MAX_BLOCKS_PER_PAGE + 1 }, () => ({
      type: 'Spacer' as const,
    }));
    expect(() =>
      parsePageStrict(minimalDoc({ pages: [{ slug: 'index', title: 'x', blocks }] })),
    ).toThrow(PageValidationError);
  });

  it('rejects a document over the 64 KiB serialized limit even though no single block exceeds the 8 KiB per-block limit', () => {
    // 9 blocks * ~8000 bytes each ~= 72,000 bytes > PAGE_DOCUMENT_MAX_BYTES (65,536), while
    // each individual block stays under the 8 KiB (8,192 byte) per-block cap.
    const nearMaxBody = 'x'.repeat(8000);
    const blocks = Array.from({ length: 9 }, () => ({ type: 'Text' as const, body: nearMaxBody }));
    expect(() =>
      parsePageStrict(minimalDoc({ pages: [{ slug: 'index', title: 'x', blocks }] })),
    ).toThrow(PageValidationError);
  });

  it('rejects a block body over the 8 KiB per-block limit', () => {
    expect(() =>
      parsePageStrict(
        minimalDoc({
          pages: [
            {
              slug: 'index',
              title: 'x',
              blocks: [{ type: 'Text', body: 'y'.repeat(9000) }],
            },
          ],
        }),
      ),
    ).toThrow(PageValidationError);
  });

  it('rejects duplicate sub-page slugs', () => {
    expect(() =>
      parsePageStrict(
        minimalDoc({
          pages: [
            { slug: 'index', title: 'a', blocks: [] },
            { slug: 'index', title: 'b', blocks: [] },
          ],
        }),
      ),
    ).toThrow(PageValidationError);
  });

  it('rejects an invalid slug', () => {
    expect(() =>
      parsePageStrict(minimalDoc({ pages: [{ slug: 'Not Valid!', title: 'x', blocks: [] }] })),
    ).toThrow(PageValidationError);
  });

  describe('Links block href scheme allowlist (spec §104, §172)', () => {
    it.each([
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
    ])('rejects %s', (href) => {
      expect(() =>
        parsePageStrict(
          minimalDoc({
            pages: [
              {
                slug: 'index',
                title: 'x',
                blocks: [{ type: 'Links', links: [{ label: 'evil', href }] }],
              },
            ],
          }),
        ),
      ).toThrow(PageValidationError);
    });

    it('accepts http and https', () => {
      for (const href of ['http://example.com', 'https://example.com/path']) {
        const doc = parsePageStrict(
          minimalDoc({
            pages: [
              {
                slug: 'index',
                title: 'x',
                blocks: [{ type: 'Links', links: [{ label: 'ok', href }] }],
              },
            ],
          }),
        );
        expect(doc.pages[0]?.blocks[0]).toMatchObject({ type: 'Links' });
      }
    });

    it('rejects a href containing an escape sequence', () => {
      expect(() =>
        parsePageStrict(
          minimalDoc({
            pages: [
              {
                slug: 'index',
                title: 'x',
                blocks: [
                  {
                    type: 'Links',
                    links: [{ label: 'evil', href: `https://example.com/${ESC}[31m` }],
                  },
                ],
              },
            ],
          }),
        ),
      ).toThrow(PageValidationError);
    });
  });

  describe('Links group headings (B-119 — link-tree-like collections)', () => {
    function linksDoc(links: unknown): unknown {
      return minimalDoc({
        pages: [{ slug: 'index', title: 'x', blocks: [{ type: 'Links', links }] }],
      });
    }

    it('accepts a group heading (optional, grouped + flat entries mixed)', () => {
      const doc = parsePageStrict(
        linksDoc([
          { label: 'dev', href: 'https://git.example', group: 'Code' },
          { label: 'flat', href: 'https://flat.example' },
        ]),
      );
      const links = doc.pages[0]?.blocks[0];
      expect(links).toMatchObject({ type: 'Links' });
      if (links?.type !== 'Links') throw new Error('expected a Links block');
      expect(links.links[0]).toMatchObject({ label: 'dev', group: 'Code' });
      expect(links.links[1]).toMatchObject({ label: 'flat' });
      expect(links.links[1]?.group).toBeUndefined();
    });

    it('normalizes a blank group to absent (no stray empty heading)', () => {
      const doc = parsePageStrict(
        linksDoc([{ label: 'x', href: 'https://x.example', group: '  ' }]),
      );
      const links = doc.pages[0]?.blocks[0];
      if (links?.type !== 'Links') throw new Error('expected a Links block');
      expect(links.links[0]).toMatchObject({ label: 'x', href: 'https://x.example' });
      expect(links.links[0]?.group).toBeUndefined();
    });

    it('strips escape sequences and trims a group heading', () => {
      const doc = parsePageStrict(
        linksDoc([{ label: 'x', href: 'https://x.example', group: `  ${ESC}[31mCode${ESC}[0m  ` }]),
      );
      const links = doc.pages[0]?.blocks[0];
      if (links?.type !== 'Links') throw new Error('expected a Links block');
      expect(links.links[0]?.group).toBe('Code');
    });

    it('rejects an over-length group heading', () => {
      expect(() =>
        parsePageStrict(
          linksDoc([{ label: 'x', href: 'https://x.example', group: 'g'.repeat(201) }]),
        ),
      ).toThrow(PageValidationError);
    });
  });

  describe('Image/Gallery media references (spec §172 — Patches media only, never remote URLs)', () => {
    it('rejects a non-uuid mediaId (e.g. a remote URL smuggled into the field)', () => {
      expect(() =>
        parsePageStrict(
          minimalDoc({
            pages: [
              {
                slug: 'index',
                title: 'x',
                blocks: [{ type: 'Image', mediaId: 'https://evil.example/tracker.png' }],
              },
            ],
          }),
        ),
      ).toThrow(PageValidationError);
    });
  });

  it('strips escape sequences from Text/Markdown/AsciiArt bodies rather than rejecting', () => {
    const doc = parsePageStrict(
      minimalDoc({
        pages: [
          {
            slug: 'index',
            title: 'x',
            blocks: [{ type: 'Text', body: `hello${ESC}[31mworld` }],
          },
        ],
      }),
    );
    const block = doc.pages[0]?.blocks[0];
    expect(block).toMatchObject({ type: 'Text', body: 'helloworld' });
  });
});

describe('serializePage', () => {
  it('round-trips through parsePageStrict', () => {
    const doc = parsePageStrict(minimalDoc());
    const json = serializePage(doc);
    expect(parsePageStrict(JSON.parse(json) as unknown)).toEqual(doc);
  });
});

describe('parsePageLenient', () => {
  it('maps an unrecognized block type to an Unknown placeholder instead of failing', () => {
    const view = parsePageLenient({
      version: 1,
      pages: [
        {
          slug: 'index',
          title: 'home',
          blocks: [
            { type: 'Text', body: 'hi' },
            { type: 'FutureBlockType', data: 'whatever' },
          ],
        },
      ],
    });
    expect(view.pages[0]?.blocks[0]).toMatchObject({ type: 'Text' });
    expect(view.pages[0]?.blocks[1]).toEqual({ type: 'Unknown', originalType: 'FutureBlockType' });
  });

  it('tolerates unknown top-level and block-level extra fields', () => {
    const view = parsePageLenient({
      version: 1,
      somethingFromTheFuture: true,
      pages: [
        {
          slug: 'index',
          title: 'home',
          blocks: [{ type: 'Text', body: 'hi', futureField: 42 }],
        },
      ],
    });
    expect(view.pages[0]?.blocks[0]).toMatchObject({ type: 'Text', body: 'hi' });
  });

  it('drops a sub-page with no slug rather than throwing', () => {
    const view = parsePageLenient({
      version: 1,
      pages: [{ title: 'no slug' }, { slug: 'index', title: 'ok', blocks: [] }],
    });
    expect(view.pages).toHaveLength(1);
    expect(view.pages[0]?.slug).toBe('index');
  });

  it('throws PageValidationError for a document with no pages array at all', () => {
    expect(() => parsePageLenient({ version: 1 })).toThrow(PageValidationError);
  });

  it('throws PageValidationError for a non-object document', () => {
    expect(() => parsePageLenient('not a document')).toThrow(PageValidationError);
  });
});

describe('parsePageForRender', () => {
  it('uses the strict parse for a valid current-version document', () => {
    const view = parsePageForRender(minimalDoc());
    expect(view.pages[0]?.blocks[0]).toMatchObject({ type: 'Text' });
  });

  it('falls back to lenient parsing for a document with an unknown block type', () => {
    const view = parsePageForRender({
      version: 1,
      pages: [{ slug: 'index', title: 'home', blocks: [{ type: 'SomeFutureBlock' }] }],
    });
    expect(view.pages[0]?.blocks[0]).toEqual({ type: 'Unknown', originalType: 'SomeFutureBlock' });
  });
});

describe('isPageValidationError', () => {
  it('narrows unknown to PageValidationError', () => {
    try {
      parsePageStrict({});
    } catch (error) {
      expect(isPageValidationError(error)).toBe(true);
    }
  });

  it('is false for an unrelated error', () => {
    expect(isPageValidationError(new Error('nope'))).toBe(false);
  });
});
