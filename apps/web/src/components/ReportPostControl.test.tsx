import type { PatchesApi } from '@patches/client';
import { ReportReason } from '@patches/proto/es';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockReportPost = vi.fn();

vi.mock('../api/client.js', () => ({
  api: { moderation: { reportPost: mockReportPost } } as unknown as PatchesApi,
}));
vi.mock('../hooks/useSession.js', () => ({
  useSession: () => ({ actor: { id: 'reporter-1' } }),
}));
vi.mock('../hooks/useErrorToast.js', () => ({ useErrorToast: () => vi.fn() }));

const { ReportPostControl } = await import('./ReportPostControl.js');

describe('ReportPostControl', () => {
  it('submits a reason and trimmed details to the moderation service', async () => {
    mockReportPost.mockResolvedValue({ reportId: 'report-1' });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ReportPostControl postId="post-1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'report' }));
    fireEvent.change(screen.getByLabelText('Report reason'), {
      target: { value: String(ReportReason.HARASSMENT) },
    });
    fireEvent.change(screen.getByLabelText('Report details'), {
      target: { value: '  repeated abuse  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() =>
      expect(mockReportPost).toHaveBeenCalledWith({
        postId: 'post-1',
        reason: ReportReason.HARASSMENT,
        details: 'repeated abuse',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Report sent.');
  });
});
