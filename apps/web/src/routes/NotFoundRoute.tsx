import type { JSX } from 'react';
import { Link, useRouteError } from 'react-router-dom';

export function NotFoundRoute(): JSX.Element {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Not found</h1>
      <p>
        <Link to="/">Go home</Link>
      </p>
    </div>
  );
}

export function RouteErrorBoundary(): JSX.Element {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Something went wrong</h1>
      <p style={{ color: 'var(--fg-muted)' }}>{message}</p>
      <p>
        <Link to="/">Go home</Link>
      </p>
    </div>
  );
}
