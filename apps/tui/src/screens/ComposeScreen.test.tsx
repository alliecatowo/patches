import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  dateToTimestamp,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  REGISTRATION_MODE,
} from '@patches/proto';
import type { Actor, GetNodeInfoResponse, Post } from '../api/wire/types.js';
import { AsciiRenderer, MediaRendererProvider, renderArtPreview } from '@patches/terminal-media';
import { render } from 'ink-testing-library';
import sharp from 'sharp';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import type { ComposeDraft } from '../compose/draft-store.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { ComposeScreen, POST_BODY_LIMIT, type ComposeScreenProps } from './ComposeScreen.js';
import { readLocalImage } from '../media/validate.js';

vi.mock('../media/validate.js', () => ({
  InvalidAttachmentError: class InvalidAttachmentError extends Error {},
  readLocalImage: vi.fn().mockResolvedValue({
    path: '/tmp/pic.png',
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
    byteSize: 3,
    sha256: 'deadbeef',
  }),
}));

/** Re-renders `ComposeScreen` with whatever draft `onChange` last produced — most
 * tests in this file only assert `onChange`'s call args, but the attach-list
 * thumbnail test needs the attachment to actually reach the render tree. */
function ControlledComposeScreen({
  initialDraft,
  ...rest
}: Omit<ComposeScreenProps, 'draft' | 'onChange'> & {
  initialDraft: ComposeDraft;
}): ReactElement {
  const [current, setCurrent] = useState(initialDraft);
  return <ComposeScreen {...rest} draft={current} onChange={setCurrent} />;
}

async function solidPng(width: number, height: number): Promise<Uint8Array> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 200, b: 40 } },
  }).png();
  return new Uint8Array(await image.toBuffer());
}

vi.mock('../media/upload.js', () => ({
  uploadMediaFile: vi.fn().mockResolvedValue({ mediaId: 'media-1' }),
  pollUntilReady: vi.fn().mockResolvedValue({ status: 'MEDIA_STATUS_READY' }),
}));

const KEY = {
  ctrlA: '',
  ctrlO: '',
  ctrlS: '',
  ctrlT: '',
  ctrlU: '',
  escape: '',
  tab: '\t',
  enter: '\r',
} as const;

function draft(overrides: Partial<ComposeDraft> = {}): ComposeDraft {
  return { body: '', clientRequestId: 'client-1', ...overrides };
}

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    author: undefined,
    body: 'hello',
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: 'post-1',
    media: [],
    createdAt: dateToTimestamp(new Date()),
    editedAt: undefined,
    deleted: false,
    counts: undefined,
    viewerState: undefined,
    contentWarning: '',
    quotedPost: undefined,
    community: undefined,
    quotePolicy: QUOTE_POLICY.UNSPECIFIED,
    repostedBy: [],
    repostedByTotal: 0,
    filteredBy: undefined,
    labels: [],
    ...overrides,
  };
}

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'actor-1',
    handle: 'bob',
    displayName: 'Bob Ross',
    bio: '',
    locationText: '',
    websiteUrl: '',
    avatar: undefined,
    isLocal: true,
    joinedAt: dateToTimestamp(new Date()),
    counts: undefined,
    nameplate: undefined,
    flair: undefined,
    pinnedPostIds: [],
    ...overrides,
  };
}

function nodeInfo(postBodyMaxChars: number): GetNodeInfoResponse {
  return {
    domain: 'patches.test',
    softwareVersion: '0.1.0',
    registrationMode: REGISTRATION_MODE.UNSPECIFIED,
    limits: {
      postBodyMaxChars,
      bioMaxChars: 500,
      displayNameMaxChars: 80,
      handleMaxChars: 30,
      locationTextMaxChars: 100,
      websiteUrlMaxChars: 2048,
      altTextMaxChars: 1000,
      searchQueryMaxChars: 100,
      // A-054 (spec §204): not exercised by anything in this file — dummy nonzero values
      // just to satisfy `NodeLimits`'s shape.
      maxFiltersPerActor: 50,
      maxFilterTermsPerFilter: 20,
      maxFilterListsPublishedPerActor: 10,
      maxFilterListEntries: 500,
      maxFilterListSubscriptions: 50,
      maxFilterListExceptionsPerList: 100,
      maxLabelerSubscriptionsPerActor: 20,
      maxLabelVocabularyEntries: 50,
      maxAppealStatementChars: 2000,
      accountExportMaxReadyArchives: 1,
    },
    capabilities: [],
    socialCapabilities: undefined,
    publicRead: true,
  };
}

function baseApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    createPost: vi.fn().mockResolvedValue({ post: post() }),
    editPost: vi.fn().mockResolvedValue({ post: post({ body: 'edited body' }) }),
    getNodeInfo: vi.fn().mockResolvedValue(nodeInfo(POST_BODY_LIMIT)),
    searchActors: vi
      .fn()
      .mockResolvedValue({ actors: [], page: { nextCursor: '', hasMore: false } }),
    searchTags: vi.fn().mockResolvedValue({ tags: [], page: { nextCursor: '', hasMore: false } }),
    ...overrides,
  } as unknown as PatchesApi;
}

async function wait(milliseconds = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('ComposeScreen', () => {
  it('posts the draft body on Ctrl+S', async () => {
    const onSubmitted = vi.fn();
    // Kept as its own local (rather than read back off `api`) so the assertion below
    // isn't a `PatchesApi`-typed method reference (`@typescript-eslint/unbound-method`).
    const createPost = vi.fn().mockResolvedValue({ post: post() });
    const api = baseApi({ createPost });
    const { stdin } = render(
      <ComposeScreen
        api={api}
        draft={draft({ body: 'hello world' })}
        onChange={() => undefined}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={onSubmitted}
        isActive
      />,
    );

    stdin.write(KEY.ctrlS);
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'hello world', clientRequestId: 'client-1' }),
      'token',
    );
  });

  it('turns the counter warn near the node limit and error over it', async () => {
    const api = baseApi({ getNodeInfo: vi.fn().mockResolvedValue(nodeInfo(10)) });
    const { lastFrame } = render(
      <ComposeScreen
        api={api}
        draft={draft({ body: '123456789' })} // 9/10 = 90%
        onChange={() => undefined}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('9/10'));
  });

  it('toggles the content-warning field with Ctrl+T', async () => {
    const onChange = vi.fn();
    const { stdin, lastFrame } = render(
      <ComposeScreen
        api={baseApi()}
        draft={draft()}
        onChange={onChange}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
      />,
    );

    expect(lastFrame()).not.toContain('Content warning');
    stdin.write(KEY.ctrlT);
    await wait();
    expect(lastFrame()).toContain('Content warning');

    stdin.write(KEY.ctrlT);
    await wait();
    expect(lastFrame()).not.toContain('Content warning');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ contentWarning: '' }));
  });

  it('swaps the editor for a rendered preview on Ctrl+O', async () => {
    const { stdin, lastFrame } = render(
      <ComposeScreen
        api={baseApi()}
        draft={draft({ body: '**bold** text' })}
        onChange={() => undefined}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
      />,
    );

    stdin.write(KEY.ctrlO);
    await wait();
    // Preview renders the markup, not the literal `**bold**` source markers.
    expect(lastFrame()).toContain('bold');
    expect(lastFrame()).not.toContain('**bold**');
  });

  it('gives the body editor the exact row budget compact/full compose computes', () => {
    const many = Array.from({ length: 20 }, (_value, index) => `line ${String(index)}`).join('\n');
    const full = render(
      <ComposeScreen
        api={baseApi()}
        draft={draft({ body: many })}
        onChange={() => undefined}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
        rows={20}
        columns={40}
      />,
    );
    // rows=20 → Math.min(8, 20 - 10) = 8 rows for the (uncompacted) editor; the
    // cursor sits at the end, so the visible window scrolls to the last line.
    expect(full.lastFrame() ?? '').toContain('line 19');

    const compact = render(
      <ComposeScreen
        api={baseApi()}
        draft={draft({ body: many })}
        onChange={() => undefined}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
        compact
        rows={20}
        columns={40}
      />,
    );
    // Same content, compact chrome: a shorter editor row budget than full compose.
    expect((compact.lastFrame() ?? '').split('\n').length).toBeLessThan(
      (full.lastFrame() ?? '').split('\n').length,
    );
  });

  it('attaches a selected file through the file picker on Ctrl+A', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'patches-compose-'));
    const filePath = join(dir, 'pic.png');
    await writeFile(filePath, Buffer.from([1, 2, 3]));
    try {
      const onChange = vi.fn();
      const { stdin, lastFrame } = render(
        <ComposeScreen
          api={baseApi()}
          draft={draft({ body: 'hi' })}
          onChange={onChange}
          onCancel={() => undefined}
          ensureAccessToken={() => Promise.resolve('token')}
          onSubmitted={() => undefined}
          isActive
        />,
      );

      stdin.write(KEY.ctrlA);
      // The picker's initial directory listing resolves asynchronously (`lstat` +
      // `readdir`) and republishes its path input when it settles — give it time to
      // finish before typing, or that resolution clobbers what was just typed.
      await wait(150);
      expect(lastFrame()).toContain('File picker');

      // Ctrl+U clears the browse-mode path buffer first — typing otherwise appends
      // to the current directory the picker already filled in. One write per
      // logical paste, not a per-character loop: Ink parses one stdin chunk as one
      // keypress, and synchronous writes with no await between them can coalesce.
      stdin.write(KEY.ctrlU);
      await wait();
      stdin.write(filePath);
      await wait();
      stdin.write(KEY.enter);
      await vi.waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            attachments: [{ mediaId: 'media-1', fileName: 'pic.png' }],
          }),
        ),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('attaches a pasted absolute image path instead of inserting it as text', async () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <ComposeScreen
        api={baseApi()}
        draft={draft()}
        onChange={onChange}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
      />,
    );

    stdin.write('[200~/tmp/dropped.png[201~');
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [{ mediaId: 'media-1', fileName: 'dropped.png' }],
        }),
      ),
    );
    // Never inserted as literal text into the body.
    const bodies = onChange.mock.calls.map((call) => (call[0] as ComposeDraft).body);
    expect(bodies.some((body) => body.includes('/tmp/dropped.png'))).toBe(false);
  });

  it('shows an art thumbnail for a local image attachment when images are enabled', async () => {
    const png = await solidPng(40, 40);
    vi.mocked(readLocalImage).mockResolvedValueOnce({
      path: '/tmp/dropped.png',
      bytes: png,
      mimeType: 'image/png',
      byteSize: png.byteLength,
      sha256: 'deadbeef',
    });
    const { stdin, lastFrame } = render(
      <MediaRendererProvider renderer={new AsciiRenderer()}>
        <ControlledComposeScreen
          initialDraft={draft()}
          api={baseApi()}
          onCancel={() => undefined}
          ensureAccessToken={() => Promise.resolve('token')}
          onSubmitted={() => undefined}
          isActive
        />
      </MediaRendererProvider>,
    );

    // Same params ComposeScreen's own `THUMBNAIL_MAX_COLS`/`THUMBNAIL_MAX_ROWS` and
    // `useContentSize()`'s test-default 80-column budget produce, so this is exactly
    // the row the component should draw — not a guess at what "art" looks like.
    const expectedRows = await renderArtPreview(png, { cols: 24, rows: 6, mode: 'ascii' });
    const expectedFirstRow = expectedRows[0];
    expect(expectedFirstRow).toBeDefined();

    stdin.write('\x1b[200~/tmp/dropped.png\x1b[201~');
    await vi.waitFor(() => expect(lastFrame()).toContain('dropped.png'));
    // The thumbnail resolves asynchronously after the attachment itself commits.
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain(expectedFirstRow ?? '__unreachable__'),
    );
  });

  it('renders no thumbnail in plain mode even with a renderer available', async () => {
    const png = await solidPng(40, 40);
    vi.mocked(readLocalImage).mockResolvedValueOnce({
      path: '/tmp/dropped.png',
      bytes: png,
      mimeType: 'image/png',
      byteSize: png.byteLength,
      sha256: 'deadbeef',
    });
    const { stdin, lastFrame } = render(
      <MediaRendererProvider renderer={new AsciiRenderer()}>
        <PlainModeProvider plain>
          <ControlledComposeScreen
            initialDraft={draft()}
            api={baseApi()}
            onCancel={() => undefined}
            ensureAccessToken={() => Promise.resolve('token')}
            onSubmitted={() => undefined}
            isActive
          />
        </PlainModeProvider>
      </MediaRendererProvider>,
    );

    const expectedRows = await renderArtPreview(png, { cols: 24, rows: 6, mode: 'ascii' });
    const expectedFirstRow = expectedRows[0];
    expect(expectedFirstRow).toBeDefined();

    stdin.write('\x1b[200~/tmp/dropped.png\x1b[201~');
    await vi.waitFor(() => expect(lastFrame()).toContain('dropped.png'));
    await wait(50);
    expect(lastFrame() ?? '').not.toContain(expectedFirstRow ?? '__unreachable__');
  });

  it('opens @-mention autocomplete over SearchActors and accepts with Tab', async () => {
    const api = baseApi({
      searchActors: vi
        .fn()
        .mockResolvedValue({ actors: [actor()], page: { nextCursor: '', hasMore: false } }),
    });
    const onChange = vi.fn();
    const { stdin, lastFrame } = render(
      <ComposeScreen
        api={api}
        draft={draft({ body: 'hi @bo' })}
        onChange={onChange}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
      />,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('Bob Ross'), { timeout: 2000 });
    stdin.write(KEY.tab);
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ body: 'hi @bob ' })),
    );
  });

  it('mode "edit" shows an edit header and calls EditPost on Ctrl+S', async () => {
    const onSubmitted = vi.fn();
    const editPost = vi.fn().mockResolvedValue({ post: post({ body: 'edited body' }) });
    const api = baseApi({ editPost });
    const { lastFrame, stdin } = render(
      <ComposeScreen
        api={api}
        mode="edit"
        postId="post-1"
        draft={draft({ body: 'revised body', contentWarning: 'spoilers' })}
        onChange={() => undefined}
        onCancel={() => undefined}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={onSubmitted}
        isActive
      />,
    );

    expect(lastFrame()).toContain('Edit post');
    stdin.write(KEY.ctrlS);
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(editPost).toHaveBeenCalledWith(
      {
        id: 'post-1',
        body: 'revised body',
        contentWarning: 'spoilers',
        mediaIds: [],
      },
      'token',
    );
  });

  it('Esc keeps the draft and leaves', async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <ComposeScreen
        api={baseApi()}
        draft={draft({ body: 'unsent' })}
        onChange={() => undefined}
        onCancel={onCancel}
        ensureAccessToken={() => Promise.resolve('token')}
        onSubmitted={() => undefined}
        isActive
      />,
    );

    stdin.write(KEY.escape);
    await wait();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
