import { render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaUploadPreview } from './MediaUploadPreview.js';

let objectUrlCount = 0;
const createObjectURL = vi.fn<(blob: Blob) => string>(() => {
  objectUrlCount += 1;
  return `blob:test-${String(objectUrlCount)}`;
});
const revokeObjectURL = vi.fn<(url: string) => void>();

describe('MediaUploadPreview', () => {
  beforeAll(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  beforeEach(() => {
    objectUrlCount = 0;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('renders one object URL for the file and revokes it on unmount', () => {
    const file = new File(['bytes'], 'shot.png', { type: 'image/png' });
    const { unmount, container } = render(
      <MediaUploadPreview file={file} alt="" className="thumb" />,
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // `alt=""` marks the preview decorative, so it deliberately has no img role.
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:test-1');
    expect(img?.getAttribute('class')).toBe('thumb');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });

  it('renders nothing for a zero-byte placeholder file and never touches object URLs', () => {
    const file = new File([], 'placeholder');
    const { container, unmount } = render(<MediaUploadPreview file={file} alt="" />);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();

    unmount();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
