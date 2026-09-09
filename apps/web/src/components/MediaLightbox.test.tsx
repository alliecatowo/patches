import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MediaLightbox } from './MediaLightbox.js';

describe('MediaLightbox', () => {
  const images = [
    { mediaId: 'm1', url: 'https://example.com/1.jpg', altText: 'Photo 1' },
    { mediaId: 'm2', url: 'https://example.com/2.jpg', altText: 'Photo 2' },
  ];

  it('renders nothing when not open', () => {
    const { container } = render(
      <MediaLightbox images={images} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders lightbox dialog and navigates between images', () => {
    const onClose = vi.fn();
    render(<MediaLightbox images={images} isOpen={true} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Image lightbox' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Photo 1')).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: 'Next image' });
    fireEvent.click(nextBtn);

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('Photo 2')).toBeInTheDocument();
  });

  it('closes on escape key or close button click', () => {
    const onClose = vi.fn();
    render(<MediaLightbox images={images} isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close lightbox' }));
    expect(onClose).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('manages focus upon open, tab key navigation trap, and restoration upon close', () => {
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Open modal';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const onClose = vi.fn();
    const { unmount, rerender } = render(
      <MediaLightbox images={images} isOpen={true} onClose={onClose} />,
    );

    const closeBtn = screen.getByRole('button', { name: 'Close lightbox' });
    const nextBtn = screen.getByRole('button', { name: 'Next image' });

    // Initial focus set to close button
    expect(document.activeElement).toBe(closeBtn);

    // Tab trap: Shift+Tab on first focusable moves focus to last focusable
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(nextBtn);

    // Tab trap: Tab on last focusable wraps to first focusable
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);

    // Focus restoration on close
    rerender(<MediaLightbox images={images} isOpen={false} onClose={onClose} />);
    expect(document.activeElement).toBe(triggerBtn);

    unmount();
    document.body.removeChild(triggerBtn);
  });
});
