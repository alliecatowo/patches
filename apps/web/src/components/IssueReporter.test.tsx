import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetWebReporterForTests } from '../lib/diagnosticsReporter.js';
import { IssueReporter } from './IssueReporter.js';

function renderReporter(props: Parameters<typeof IssueReporter>[0] = {}): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <IssueReporter {...props} />
    </MemoryRouter>,
  );
}

describe('IssueReporter', () => {
  beforeEach(() => {
    resetWebReporterForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the affordance in both variants and opens the modal', () => {
    const { unmount: unmountFloating } = render(
      <MemoryRouter>
        <IssueReporter variant="floating" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Report an issue' })).toBeInTheDocument();
    unmountFloating();

    renderReporter({ variant: 'inline' });
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Message contents are never included/)).toBeInTheDocument();
  });

  it('keeps the @handle checkbox opt-in (off by default)', () => {
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    const checkbox: HTMLInputElement = screen.getByLabelText(/include my @/i);
    expect(checkbox.checked).toBe(false);
  });

  it('opens immediately when autoOpen is set (error-boundary invitation)', () => {
    renderReporter({ autoOpen: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // §194-safe copy check: the reporter invites everything — bugs, jank, ideas — and
  // never frames itself around engagement or ranking.
  it('copy invites bugs, jank and ideas alike', () => {
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    expect(screen.getByText('What happened — bug, jank, or idea? (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/feature you wish existed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report an issue' })).toHaveAttribute(
      'title',
      'Issue, jank, or idea — anything counts',
    );
  });

  it('files a zero-input report and links the created issue', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ number: 12, url: 'https://github.com/x/issues/12' }), {
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(screen.getByText(/issue #12/i)).toBeInTheDocument());
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '') as {
      description?: string;
      website?: string;
      bundle: { app: string };
    };
    // Zero input still files — description is optional, bundle carries the context.
    expect(body.description).toBeUndefined();
    expect(body.website).toBeUndefined(); // honeypot never sent by this client
    expect(body.bundle.app).toBe('web');
  });

  it('falls back to a download and the issues URL when the endpoint is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));
    let clicked = 0;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = realCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') {
        Object.defineProperty(element, 'click', { value: (): number => (clicked += 1) });
      }
      return element;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() =>
      expect(screen.getByText(/Could not reach the report endpoint/)).toBeInTheDocument(),
    );
    expect(clicked).toBe(1);
    expect(screen.getByText(/patches-report\.json/)).toBeInTheDocument();
    expect(screen.getAllByText(/github\.com\/alliecatowo\/patches\/issues/).length).toBeGreaterThan(
      0,
    );
  });
});
