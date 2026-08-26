import { useEffect, useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { photoDataUri } from '../../.storybook/fixtures.js';
import { MediaUploadPreview } from './MediaUploadPreview.js';

const meta = {
  title: 'Design System/MediaUploadPreview',
  component: MediaUploadPreview,
  args: {
    file: new File([], 'fixture-placeholder.png', { type: 'image/png' }),
    alt: 'Synthetic fixture upload',
  },
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof MediaUploadPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `File` objects can't cross the manager/iframe boundary as args, so the image-bearing
 * stories materialize the fixture bytes in-story (a fetch of a data: URI is fully
 * hermetic — no network).
 */
function PreviewFromDataUri({ uri, alt }: { uri: string; alt: string }): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(uri)
      .then((response) => response.blob())
      .then((blob) => {
        if (alive) setFile(new File([blob], 'fixture-upload.png', { type: 'image/png' }));
      });
    return () => {
      alive = false;
    };
  }, [uri]);
  if (file === null) return <p style={{ color: 'var(--fg-muted)' }}>materializing fixture…</p>;
  return <MediaUploadPreview file={file} alt={alt} />;
}

export const ImageFile: Story = {
  render: () => (
    <div style={{ width: 180 }}>
      <PreviewFromDataUri uri={photoDataUri('upload', '#2f855a')} alt="Synthetic fixture upload" />
    </div>
  ),
};

/**
 * Zero-byte files are the edit-mode placeholder handles ComposeRoute seeds from a post's
 * media list — they render nothing instead of a broken image, by design.
 */
export const ZeroByteFileRendersNothing: Story = {
  render: () => {
    const empty = new File([], 'placeholder.png', { type: 'image/png' });
    return (
      <div style={{ width: 180, minHeight: 48, outline: '1px dashed var(--border)' }}>
        <MediaUploadPreview file={empty} alt="" />
        <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
          (a zero-byte placeholder renders nothing inside the dashed box)
        </p>
      </div>
    );
  },
};
