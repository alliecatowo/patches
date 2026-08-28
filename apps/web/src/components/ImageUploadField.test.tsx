import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCropImageToAspect = vi.fn();
const mockUploadMedia = vi.fn();

vi.mock('../lib/imageCrop.js', () => ({ cropImageToAspect: mockCropImageToAspect }));
vi.mock('../lib/mediaUpload.js', () => ({ uploadMedia: mockUploadMedia }));
vi.mock('./MediaImage.js', () => ({ MediaImage: () => null }));

const { ImageUploadField } = await import('./ImageUploadField.js');

describe('ImageUploadField', () => {
  afterEach(() => {
    mockCropImageToAspect.mockReset();
    mockUploadMedia.mockReset();
  });

  it('crops, uploads, and reports the resulting media id (#324)', async () => {
    const cropped = new File(['cropped'], 'photo.png', { type: 'image/png' });
    mockCropImageToAspect.mockResolvedValue(cropped);
    mockUploadMedia.mockResolvedValue('media-42');
    const onChange = vi.fn();

    render(
      <ImageUploadField
        aspect={1}
        shape="avatar"
        label="Avatar"
        currentMediaId=""
        onChange={onChange}
      />,
    );

    const input: HTMLInputElement = screen.getByLabelText('Avatar', { selector: 'input' });
    const original = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [original] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('media-42');
    });
    expect(mockCropImageToAspect).toHaveBeenCalledWith(original, 1);
    expect(mockUploadMedia).toHaveBeenCalledWith(cropped, expect.any(Function));
  });

  it('rejects an oversized file client-side without ever calling uploadMedia', async () => {
    const onChange = vi.fn();
    render(
      <ImageUploadField
        aspect={1}
        shape="avatar"
        label="Avatar"
        currentMediaId=""
        onChange={onChange}
      />,
    );

    const input: HTMLInputElement = screen.getByLabelText('Avatar', { selector: 'input' });
    const oversized = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });
    Object.defineProperty(input, 'files', { value: [oversized] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(mockUploadMedia).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a remove button once a media id is set, and clears it on click', async () => {
    const onChange = vi.fn();
    render(
      <ImageUploadField
        aspect={3}
        shape="banner"
        label="Banner"
        currentMediaId="media-existing"
        onChange={onChange}
      />,
    );

    const removeBtn = await screen.findByRole('button', { name: /remove banner/i });
    removeBtn.click();
    expect(onChange).toHaveBeenCalledWith('');
  });
});
