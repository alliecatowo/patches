import { create } from '@bufbuild/protobuf';
import {
  GetPageResponseSchema,
  ListActorPostsResponseSchema,
  ListGuestbookResponseSchema,
  ListMutualFollowsResponseSchema,
} from '@patches/proto/es';
import type { GetPageResponse } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import type { ReactElement, ReactNode } from 'react';
import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { ContentSizeProvider } from '../app/layout.js';
import { PageScreen } from './PageScreen.js';
import { makePageInfo } from '../test/wire-fixtures.js';

/** `App.tsx` always mounts a screen inside a `<Box width={columns}>` root — an
 * un-constrained child Box otherwise grows to Ink's *real* terminal width (100,
 * `ink-testing-library`'s hard-coded `Stdout.columns`), not the size this test means
 * to exercise, since Yoga only bounds a childless-width Box by its actual parent, not
 * by `ContentSizeProvider`'s advisory value alone. */
function widthBounded(columns: number, rows: number, children: ReactNode): ReactElement {
  return (
    <Box width={columns} height={rows} flexDirection="column">
      <ContentSizeProvider size={{ columns, rows }}>{children}</ContentSizeProvider>
    </Box>
  );
}

/** Mirrors `pages/render/blocks.test.tsx`'s `fakeApi` — a hand-built `PatchesApi`
 * stand-in, not the full `FakeApiHandle` (outside this task's owned files: see
 * `pages/render/pinned.test.tsx`'s identical note). */
function fakeApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  const base: Partial<PatchesApi> = {
    getActor: () => Promise.reject(new Error('no pinned posts in this test')),
    getActorByHandle: () => Promise.reject(new Error('no such actor in this test')),
    listActorPosts: () =>
      Promise.resolve(create(ListActorPostsResponseSchema, { page: makePageInfo() })),
    listGuestbook: () =>
      Promise.resolve(create(ListGuestbookResponseSchema, { page: makePageInfo() })),
    listMutualFollows: () =>
      Promise.resolve(create(ListMutualFollowsResponseSchema, { page: makePageInfo() })),
  };
  return { ...base, ...overrides } as unknown as PatchesApi;
}

/** A document exercising every P12-109 layout concern at once: sidebar-shaped blocks
 * (`TopEight`/`Links`/`Friends`) to trigger `planPageGrid`'s multi-lane layout, a
 * `Gallery` (its own internal grid), and an `AsciiArt` block long enough that its
 * string-width clipping actually has to clip something. */
function wideDocument(): GetPageResponse {
  return create(GetPageResponseSchema, {
    ownerActorId: 'actor-1',
    activeSlug: 'index',
    document: Buffer.from(
      JSON.stringify({
        version: 1,
        pages: [
          {
            slug: 'index',
            title: 'Home',
            blocks: [
              {
                type: 'Text',
                body: 'A long-ish paragraph of body text, present so the main lane has enough content to wrap across several lines at every width tier this test exercises.',
              },
              {
                type: 'AsciiArt',
                art: '='.repeat(200),
              },
              {
                type: 'Gallery',
                mediaIds: [
                  '11111111-1111-4111-8111-111111111111',
                  '22222222-2222-4222-8222-222222222222',
                ],
                caption: 'gallery caption',
              },
              { type: 'TopEight', actors: ['@bob', '@carol'] },
              { type: 'Friends' },
              {
                type: 'Links',
                links: [
                  { label: 'Site', href: 'https://example.test' },
                  { label: 'Blog', href: 'https://example.test/blog' },
                ],
              },
            ],
          },
        ],
      }),
      'utf8',
    ),
    revisionId: 'rev-1',
  });
}

async function waitForFrame(
  lastFrame: () => string | undefined,
  predicate: (frame: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const stepMs = 10;
  const deadline = Date.now() + timeoutMs;
  let frame = lastFrame() ?? '';
  while (!predicate(frame)) {
    if (Date.now() >= deadline) {
      throw new Error(`waitForFrame: timed out after ${timeoutMs}ms. Last frame:\n${frame}`);
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    frame = lastFrame() ?? '';
  }
  return frame;
}

describe('PageScreen frame invariant (P12-109)', () => {
  it.each([
    { label: '80x24', columns: 80 },
    { label: '100x30', columns: 100 },
    { label: '140x40', columns: 140 },
  ])('never renders a line wider than $label', async ({ columns }) => {
    const api = fakeApi({ getPage: () => Promise.resolve(wideDocument()) });
    const { lastFrame } = render(
      widthBounded(columns, 40, <PageScreen api={api} handle="alice" isActive />),
    );
    const frame = await waitForFrame(lastFrame, (text) => text.includes('gallery caption'));
    for (const [index, line] of frame.split('\n').entries()) {
      expect(
        stringWidth(line),
        `line ${String(index)} is ${String(stringWidth(line))} cells wide, budget is ${String(columns)}`,
      ).toBeLessThanOrEqual(columns);
    }
  });

  it('never renders a line wider than the content width when the page has a border theme', async () => {
    const api = fakeApi({
      getPage: () =>
        Promise.resolve({
          ...wideDocument(),
          document: Buffer.from(
            JSON.stringify({
              version: 1,
              theme: { accent: '#ff00ff', border: 'round' },
              pages: [
                {
                  slug: 'index',
                  title: 'Home',
                  blocks: [{ type: 'AsciiArt', art: '*'.repeat(150) }],
                },
              ],
            }),
            'utf8',
          ),
        }),
    });
    const columns = 80;
    const { lastFrame } = render(
      widthBounded(columns, 24, <PageScreen api={api} handle="alice" isActive />),
    );
    const frame = await waitForFrame(lastFrame, (text) => text.includes('@alice'));
    for (const line of frame.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(columns);
    }
  });
});
