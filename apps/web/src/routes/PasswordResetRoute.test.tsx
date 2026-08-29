import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    auth: { requestPasswordReset, resetPassword },
  } as unknown as PatchesApi,
}));

const { PasswordResetRoute } = await import('./PasswordResetRoute.js');

function renderRoute(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PasswordResetRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('PasswordResetRoute', () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
    resetPassword.mockReset();
  });

  it('keeps the request response uniform before accepting a reset code', async () => {
    requestPasswordReset.mockResolvedValue({});
    renderRoute();

    fireEvent.change(screen.getByLabelText('Recovery email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));

    expect(await screen.findByRole('status')).toHaveTextContent('If that address can reset');
    expect(requestPasswordReset).toHaveBeenCalledWith(
      { email: 'person@example.com' },
      expect.anything(),
    );
    expect(screen.getByLabelText('Reset code')).toBeInTheDocument();
  });

  it('submits the code and new password without retaining either in the URL', async () => {
    requestPasswordReset.mockResolvedValue({});
    resetPassword.mockResolvedValue({});
    renderRoute();

    fireEvent.change(screen.getByLabelText('Recovery email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    await screen.findByLabelText('Reset code');
    fireEvent.change(screen.getByLabelText('Reset code'), { target: { value: 'code-1' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await vi.waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith(
        { code: 'code-1', newPassword: 'new-password' },
        expect.anything(),
      ),
    );
  });
});
