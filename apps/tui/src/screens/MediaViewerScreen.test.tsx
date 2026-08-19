import type { MediaAttachment } from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { ContentSizeProvider } from '../app/layout.js';
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
});
