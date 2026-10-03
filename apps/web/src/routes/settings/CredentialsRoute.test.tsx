import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockChangePassword = vi.fn();
const mockSignOut = vi.fn(() => Promise.resolve());

vi.mock('../../api/client.js', () => ({
  api: {
    auth: {
      listCredentials: () => Promise.resolve({ credentials: [] }),
      getAuthPolicy: () => Promise.resolve({ githubAuth: false, oidcProviders: [] }),
      changePassword: mockChangePassword,
    },
  },
  signOut: mockSignOut,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { CredentialsRoute } = await import('./CredentialsRoute.js');

function renderRoute(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/settings/credentials']}>
        <Routes>
          <Route path="/settings/credentials" element={<CredentialsRoute />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillAndSubmit(): void {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-pass' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-pass-1234' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'new-pass-1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('CredentialsRoute change password', () => {
  beforeEach(() => {
    mockChangePassword.mockReset();
    mockSignOut.mockClear();
  });

  it('shows the error and stays signed in when the current password is wrong', async () => {
    mockChangePassword.mockRejectedValue(new ConnectError('wrong', Code.Unauthenticated));
    renderRoute();
    fillAndSubmit();

    expect(await screen.findByText(/no longer valid|wrong|session/i)).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('signs out deliberately and routes to /login after a successful change', async () => {
    mockChangePassword.mockResolvedValue({});
    renderRoute();
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
