import { useEffect, type JSX } from 'react';
import { Link, useRouteError } from 'react-router-dom';

import { IssueReporter } from '../components/IssueReporter.js';
import { recordWebBreadcrumb } from '../lib/diagnosticsReporter.js';

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

  // React-router's errorElement swallows render errors before window.onerror sees
  // them — record the breadcrumb here so a `:report` bundle still carries what broke.
  useEffect(() => {
    recordWebBreadcrumb('window-error', message);
  }, [message]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Something went wrong</h1>
      <p style={{ color: 'var(--fg-muted)' }}>{message}</p>
      <p>
        <Link to="/">Go home</Link>
      </p>
      <IssueReporter variant="floating" />
    </div>
  );
}
