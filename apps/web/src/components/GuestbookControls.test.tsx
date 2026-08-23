import type { PatchesApi } from '@patches/client';
import { ReportReason } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from '../api/session.js';
import { GuestbookEntryActions, GuestbookSignForm } from './GuestbookControls.js';

const mockSignGuestbook = vi.fn<(...args: unknown[]) => Promise<object>>();
const mockRemoveGuestbookEntry = vi.fn<(...args: unknown[]) => Promise<object>>();
const mockReportGuestbookEntry = vi.fn<(...args: unknown[]) => Promise<object>>();

vi.mock('../api/client.js', () => ({
  api: {
    pages: {
      signGuestbook: (...args: unknown[]): Promise<object> => mockSignGuestbook(...args),
      removeGuestbookEntry: (...args: unknown[]): Promise<object> =>
        mockRemoveGuestbookEntry(...args),
      reportGuestbookEntry: (...args: unknown[]): Promise<object> =>
        mockReportGuestbookEntry(...args),
    },
  } as unknown as PatchesApi,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: vi.fn(),
}));

vi.mock('../hooks/useErrorToast.js', () => ({ useErrorToast: () => vi.fn() }));

const mockUseSession = vi.mocked((await import('../hooks/useSession.js')).useSession);

/** The components only read `session.actor.id`; the rest of the proto Actor is noise. */
function signIn(actorId: string | null): void {
  mockUseSession.mockReturnValue(
    actorId === null ? null : ({ actor: { id: actorId } } as unknown as AppSession),
  );
}

function renderTree(element: ReactElement): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('GuestbookSignForm', () => {
  beforeEach(() => {
    mockSignGuestbook.mockReset();
    mockRemoveGuestbookEntry.mockReset();
    mockReportGuestbookEntry.mockReset();
    mockUseSession.mockReset();
  });

  it('renders nothing for a signed-out viewer', () => {
    signIn(null);
    renderTree(<GuestbookSignForm handle="allie" slug="home" />);

    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
  });

  it('submits the trimmed body and refreshes the list on success', async () => {
    signIn('viewer-1');
    mockSignGuestbook.mockResolvedValue({ entry: {} });
    const queryClient = renderTree(<GuestbookSignForm handle="allie" slug="home" />);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    fireEvent.change(screen.getByLabelText('Guestbook entry'), {
      target: { value: '  great page  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));

    await waitFor(() =>
      expect(mockSignGuestbook).toHaveBeenCalledWith({
        handle: 'allie',
        slug: 'home',
        body: 'great page',
      }),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['page', 'allie', 'home', 'guestbook'],
      }),
    );
    // The form resets after a successful sign.
    expect(screen.getByLabelText('Guestbook entry')).toHaveValue('');
  });
});

describe('GuestbookEntryActions', () => {
  beforeEach(() => {
    mockSignGuestbook.mockReset();
    mockRemoveGuestbookEntry.mockReset();
    mockReportGuestbookEntry.mockReset();
    mockUseSession.mockReset();
  });

  it('renders nothing for a signed-out viewer', () => {
    signIn(null);
    renderTree(
      <GuestbookEntryActions entryId="entry-1" authorActorId="actor-2" ownerActorId="actor-1" />,
    );

    expect(screen.queryByRole('button', { name: 'report' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'remove' })).not.toBeInTheDocument();
  });

  it('hides both affordances on your own entry when you are not the page owner', () => {
    // Signed author, not the owner — reporting yourself is meaningless.
    signIn('actor-2');
    renderTree(
      <GuestbookEntryActions entryId="entry-1" authorActorId="actor-2" ownerActorId="actor-1" />,
    );

    expect(screen.queryByRole('button', { name: 'report' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'remove' })).not.toBeInTheDocument();
  });

  it('offers remove to the page owner and invalidates after success', async () => {
    signIn('actor-1');
    mockRemoveGuestbookEntry.mockResolvedValue({ entry: {} });
    const queryClient = renderTree(
      <GuestbookEntryActions entryId="entry-1" authorActorId="actor-2" ownerActorId="actor-1" />,
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'remove' }));

    await waitFor(() =>
      expect(mockRemoveGuestbookEntry).toHaveBeenCalledWith({ entryId: 'entry-1' }),
    );
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['page'] }));
  });

  it('reports someone else\u2019s entry with a reason and trimmed details', async () => {
    signIn('reporter-1');
    mockReportGuestbookEntry.mockResolvedValue({ reportId: 'report-1' });
    renderTree(
      <GuestbookEntryActions entryId="entry-1" authorActorId="actor-2" ownerActorId="actor-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'report' }));
    fireEvent.change(screen.getByLabelText('Report reason'), {
      target: { value: String(ReportReason.SPAM) },
    });
    fireEvent.change(screen.getByLabelText('Report details'), {
      target: { value: '  ads in every sign  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() =>
      expect(mockReportGuestbookEntry).toHaveBeenCalledWith({
        entryId: 'entry-1',
        reason: ReportReason.SPAM,
        details: 'ads in every sign',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Report sent.');
  });
});
