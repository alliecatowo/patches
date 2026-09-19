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

  it('traps focus inside lightbox on Tab and restores focus on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open Lightbox';
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<MediaLightbox images={images} isOpen={true} onClose={vi.fn()} />);

    const closeBtn = screen.getByRole('button', { name: 'Close lightbox' });
    const nextBtn = screen.getByRole('button', { name: 'Next image' });

    // Focus last element and press Tab -> loops to first element
    nextBtn.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Focus first element and press Shift+Tab -> loops to last element
    closeBtn.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(nextBtn);

    // When closed, restores focus to trigger button
    rerender(<MediaLightbox images={images} isOpen={false} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});
