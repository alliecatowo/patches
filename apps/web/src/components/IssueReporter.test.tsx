import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetWebReporterForTests } from '../lib/diagnosticsReporter.js';
import { CLIPBOARD_DEADLINE_MS, IssueReporter } from './IssueReporter.js';

function renderReporter(
  props: Parameters<typeof IssueReporter>[0] = {},
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <IssueReporter {...props} />
    </MemoryRouter>,
  );
}

function renderOnReportRoute(previous: string | undefined): ReturnType<typeof render> {
  const entries = previous === undefined ? ['/report'] : [previous, '/report'];
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        {previous === undefined ? null : (
          <Route path={previous} element={<p>{previous} screen</p>} />
        )}
        <Route path="/report" element={<IssueReporter variant="inline" autoOpen />} />
        <Route path="/" element={<p>home screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Counts real anchor clicks for downloads while leaving every other tag untouched. */
function stubDownload(): { count: number } {
  const clicks = { count: 0 };
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = realCreate(tag) as HTMLAnchorElement;
    if (tag === 'a') {
      Object.defineProperty(element, 'click', { value: (): number => (clicks.count += 1) });
    }
    return element;
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  return clicks;
}

describe('IssueReporter', () => {
  beforeEach(() => {
    resetWebReporterForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
      'Bug, jank, or feature idea — anything counts',
    );
  });

  // B-151: there is no report backend — the save is local (download + clipboard)
  // and must always resolve, even with zero user input.
  it('saves a zero-input report locally — download + clipboard — and always resolves', async () => {
    const clicks = stubDownload();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save report' }));

    await waitFor(() => expect(screen.getByText(/Saved patches-report\.json/)).toBeInTheDocument());
    expect(screen.getByText(/copied the JSON to your clipboard/)).toBeInTheDocument();
    expect(clicks.count).toBe(1);
    expect(screen.queryByText('Saving…')).toBeNull();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = JSON.parse(writeText.mock.calls[0]?.[0] ?? '{}') as {
      app: string;
      notes?: string;
    };
    expect(copied.app).toBe('web');
    expect(copied.notes).toBeUndefined(); // zero input still saves — description optional
  });

  it('still resolves download-only when no clipboard pathway exists', async () => {
    const clicks = stubDownload();
    vi.stubGlobal('navigator', {});
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save report' }));

    await waitFor(() => expect(screen.getByText(/Saved patches-report\.json/)).toBeInTheDocument());
    expect(screen.getByText(/clipboard copy was unavailable/)).toBeInTheDocument();
    expect(clicks.count).toBe(1);
    expect(screen.getByRole('button', { name: 'Save report' })).toBeEnabled();
  });

  it('never gets stuck saving: a hung clipboard write resolves at the deadline (B-151)', async () => {
    vi.useFakeTimers();
    const clicks = stubDownload();
    const writeText = vi.fn().mockImplementation(() => new Promise<void>(() => undefined));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save report' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIPBOARD_DEADLINE_MS + 100);
    });
    expect(screen.getByText(/Saved patches-report\.json/)).toBeInTheDocument();
    expect(clicks.count).toBe(1);
    expect(screen.queryByText('Sending…')).toBeNull();
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it('surfaces a save error, keeps the description, and clears the saving state (B-151)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('blob storage full');
    });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.change(screen.getByLabelText(/What happened/), {
      target: { value: 'composer ate my draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save report' }));

    await waitFor(() => expect(screen.getByText(/Could not save the report/)).toBeInTheDocument());
    expect(screen.getByText(/blob storage full/)).toBeInTheDocument();
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(screen.getByLabelText(/What happened/)).toHaveValue('composer ate my draft');
    expect(screen.getByRole('button', { name: 'Save report' })).toBeEnabled();
  });

  it('closing on /report returns to the previous screen (B-152)', () => {
    renderOnReportRoute('/compose');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // React Router keeps its history index in window.history.state.idx.
    Object.defineProperty(window.history, 'state', { configurable: true, value: { idx: 1 } });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    } finally {
      Reflect.deleteProperty(window.history, 'state');
    }
    expect(screen.getByText('/compose screen')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a deep-linked /report (no in-app history) closes to home instead of stranding (B-152)', () => {
    renderOnReportRoute(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('home screen')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('attach is always enabled and opens the device image picker (B-150)', () => {
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    const attach = screen.getByRole('button', { name: /Attach screenshot/ });
    // No getDisplayMedia in jsdom — the picker path must still work everywhere.
    expect(attach).toBeEnabled();
    // The hidden input is the picker target; the button drives it.
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('accept')).toBe('image/*');
  });

  it('explains an unsupported file instead of silently doing nothing (B-150)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    renderReporter();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'broken.png', { type: 'image/png' })],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() =>
      expect(screen.getByText('the image could not be read')).toBeInTheDocument(),
    );
  });
});
