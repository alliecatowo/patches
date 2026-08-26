import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetWebReporterForTests } from '../lib/diagnosticsReporter.js';
import { LazyRouteBoundary } from './LazyRouteBoundary.js';

function ThrowingRoute({ message }: { message: string }): never {
  throw new Error(message);
}

/** A minimal stand-in for RootLayout's shell: a persistent nav plus an Outlet. */
function Shell(): JSX.Element {
  return (
    <div>
      <nav aria-label="Primary">shell nav</nav>
      <Outlet />
    </div>
  );
}

function renderWithBoundary(message: string): ReturnType<typeof render> {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Shell />,
        children: [
          {
            index: true,
            element: <ThrowingRoute message={message} />,
            errorElement: <LazyRouteBoundary />,
          },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('LazyRouteBoundary', () => {
  afterEach(() => {
    resetWebReporterForTests();
    vi.restoreAllMocks();
  });

  it('renders a recoverable panel for the failed route while the shell survives', () => {
    renderWithBoundary('boom');

    // The shell around the Outlet is a sibling of the errorElement, not an ancestor
    // route with its own errorElement, so it stays mounted alongside the panel.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveTextContent('shell nav');
    expect(screen.getByRole('alert')).toHaveTextContent('This page hit a snag');
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers a reload button instead of retry for a chunk-load failure', () => {
    renderWithBoundary('Failed to fetch dynamically imported module: /assets/Home-abc123.js');

    expect(screen.getByRole('alert')).toHaveTextContent('Update available');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
