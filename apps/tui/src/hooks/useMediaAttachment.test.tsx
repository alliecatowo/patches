import { MEDIA_STATUS } from '../api/wire/enums.js';
import type { MediaAttachment } from '../api/wire/types.js';
import {
  MediaRendererProvider,
  type PreparedImage,
  type TerminalMediaRenderer,
} from '@patches/terminal-media';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { MediaAttachments } from '../components/MediaAttachments.js';
import type { MediaCache } from '../media/cache.js';
import { MediaSessionProvider } from '../media/media-session.js';
import { makeMediaAttachment } from '../test/wire-fixtures.js';

const attachment: MediaAttachment = makeMediaAttachment({
  altText: 'a test image',
  width: 40,
  height: 20,
});

describe('useMediaAttachment terminal ownership', () => {
  it('deletes a prepared Kitty placement when its React owner unmounts', async () => {
    const prepared: PreparedImage = { id: 7, cols: 4, rows: 2, widthPx: 40, heightPx: 20 };
    const release = vi.fn();
    const prepare = vi.fn().mockResolvedValue(prepared);
    const renderer: TerminalMediaRenderer = {
      kind: 'kitty',
      prepare,
      placeholderRows: () => ['one', 'two'],
      release,
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

    const rendered = render(
      <MediaRendererProvider renderer={renderer}>
        <MediaSessionProvider
          session={{ api, cache, ensureAccessToken: () => Promise.resolve('t') }}
        >
          <MediaAttachments attachments={[attachment]} inline />
        </MediaSessionProvider>
      </MediaRendererProvider>,
    );

    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    rendered.unmount();
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(prepared);
  });
});
