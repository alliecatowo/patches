import type { PatchesApi } from '@patches/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/client.js', () => ({
  api: {
    node: { getNodePolicy: vi.fn().mockResolvedValue({ policy: undefined }) },
    auth: { getAuthPolicy: vi.fn().mockResolvedValue({}), register: vi.fn() },
    privacy: { acknowledgePrivacyNotice: vi.fn() },
  } as unknown as PatchesApi,
  establishSession: vi.fn(),
}));

const { RegisterRoute, validateInviteCode } = await import('./RegisterRoute.js');

function renderAt(url: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <RegisterRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('validateInviteCode', () => {
  it('accepts the url-safe codes the admin CLI mints', () => {
    expect(validateInviteCode('Zm9vYmFyLV9iYXo')).toBeNull();
  });

  it('rejects empty, oversized and non url-safe codes', () => {
    expect(validateInviteCode('   ')).not.toBeNull();
    expect(validateInviteCode('a'.repeat(201))).not.toBeNull();
    expect(validateInviteCode('abc def')).not.toBeNull();
    expect(validateInviteCode('abc/def')).not.toBeNull();
  });
});

describe('RegisterRoute invite links', () => {
  it('prefills the invite code from ?invite= and says so', () => {
    renderAt('/register?invite=Zm9vYmFy');
    expect(screen.getByLabelText('Invite code')).toHaveValue('Zm9vYmFy');
    expect(screen.getByText('Filled in from your invite link.')).toBeInTheDocument();
  });

  it('flags a malformed linked code and disables submit', () => {
    renderAt('/register?invite=not%20a%20code');
    expect(screen.getByRole('alert')).toHaveTextContent('Invite codes only use');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('leaves the field empty and quiet without a link', () => {
    renderAt('/register');
    expect(screen.getByLabelText('Invite code')).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(screen.getByLabelText('Invite code'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the invite code');
  });
});
