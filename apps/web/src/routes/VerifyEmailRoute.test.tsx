import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyEmail = vi.fn();
const resendVerification = vi.fn();

vi.mock('../api/client.js', () => ({
  api: { auth: { verifyEmail, resendVerification } } as unknown as PatchesApi,
}));

const { VerifyEmailRoute } = await import('./VerifyEmailRoute.js');

function renderRoute(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VerifyEmailRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(tree);
}

describe('VerifyEmailRoute', () => {
  beforeEach(() => {
    verifyEmail.mockReset();
    resendVerification.mockReset();
  });

  it('verifies the entered code and resends only for the authenticated caller', async () => {
    verifyEmail.mockResolvedValue({ emailVerified: true });
    resendVerification.mockResolvedValue({});
    renderRoute();

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: 'verify-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByRole('status')).toHaveTextContent('verified');
    expect(verifyEmail).toHaveBeenCalledWith({ code: 'verify-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Resend it' }));
    await vi.waitFor(() => expect(resendVerification).toHaveBeenCalledWith({}));
  });
});
