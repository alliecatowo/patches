import { MEDIA_STATUS } from '@patches/proto';
import type { MediaAttachment } from '../api/wire/types.js';
import {
  MediaRendererProvider,
  type PreparedImage,
  type TerminalMediaRenderer,
} from '@patches/terminal-media';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { ContentSizeProvider } from '../app/layout.js';
import type { MediaCache } from '../media/cache.js';
import { MediaSessionProvider } from '../media/media-session.js';
import { MediaViewerScreen } from './MediaViewerScreen.js';

function attachment(id: string, altText: string): MediaAttachment {
  return { mediaId: id, altText, width: 640, height: 480, mimeType: 'image/png', position: 0 };
}

describe('MediaViewerScreen', () => {
  it('navigates with Vim keys, opens the selected image, and exits with Escape', async () => {
    const first = attachment('one', 'first image');
    const second = attachment('two', 'second image');
    const onOpenExternal = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame, stdin } = render(
      <ContentSizeProvider size={{ rows: 16, columns: 80 }}>
        <MediaViewerScreen
          attachments={[first, second]}
          isActive
          onOpenExternal={onOpenExternal}
          onCancel={onCancel}
        />
      </ContentSizeProvider>,
    );

    expect(lastFrame()).toContain('first image');
    stdin.write('l');
    await vi.waitFor(() => expect(lastFrame()).toContain('second image'));
    stdin.write('o');
    expect(onOpenExternal).toHaveBeenCalledWith(second);
    stdin.write('\u001b');
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });

  it('draws half-block/ascii art directly (not the description box) when the renderer is not Kitty', async () => {
    const only = attachment('one', 'a pixel-art image');
    const prepared: PreparedImage = { id: 1, cols: 10, rows: 5, widthPx: 100, heightPx: 50 };
    const prepare = vi.fn().mockResolvedValue(prepared);
    const renderer: TerminalMediaRenderer = {
      kind: 'halfblock',
      prepare,
      placeholderRows: () => ['ART-ROW-1', 'ART-ROW-2'],
      release: vi.fn(),
      releaseAll: vi.fn(),
    };
    const api = {
      getMediaDownload: vi.fn().mockResolvedValue({
        status: MEDIA_STATUS.READY,
        mimeType: 'image/png',
        thumbnailUrl: 'https://media.test/thumbnail',
        downloadUrl: 'https://media.test/original',
      }),
    } as unknown as PatchesApi;
    const cache = {
      getOrFetch: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), path: '/tmp/image' }),
    } as unknown as MediaCache;

    const { lastFrame } = render(
      <MediaRendererProvider renderer={renderer}>
        <MediaSessionProvider
          session={{ api, cache, ensureAccessToken: () => Promise.resolve('t') }}
        >
          <ContentSizeProvider size={{ rows: 16, columns: 80 }}>
            <MediaViewerScreen attachments={[only]} isActive />
          </ContentSizeProvider>
        </MediaSessionProvider>
      </MediaRendererProvider>,
    );

    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    // Called with the viewer's full art budget, not a timeline row's 3-row default.
    expect(prepare).toHaveBeenCalledWith(
      { bytes: new Uint8Array([1]), mime: 'image/png' },
      { maxCols: 78, maxRows: 11 },
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('ART-ROW-1'));
    expect(lastFrame()).not.toContain('press o to open externally');
  });

  it('falls back to the description box when the renderer is the box renderer', async () => {
    const only = attachment('one', 'a boxed image');
    const renderer: TerminalMediaRenderer = {
      kind: 'box',
      prepare: vi.fn(),
      placeholderRows: () => [],
      release: vi.fn(),
      releaseAll: vi.fn(),
    };
    const api = { getMediaDownload: vi.fn() } as unknown as PatchesApi;
    const cache = { getOrFetch: vi.fn() } as unknown as MediaCache;

    const { lastFrame } = render(
      <MediaRendererProvider renderer={renderer}>
        <MediaSessionProvider
          session={{ api, cache, ensureAccessToken: () => Promise.resolve('t') }}
        >
          <ContentSizeProvider size={{ rows: 16, columns: 80 }}>
            <MediaViewerScreen attachments={[only]} isActive />
          </ContentSizeProvider>
        </MediaSessionProvider>
      </MediaRendererProvider>,
    );

    await vi.waitFor(() => expect(lastFrame()).toContain('press o to open externally'));
  });
});
