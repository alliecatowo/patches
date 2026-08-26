import { useEffect, useMemo, type JSX } from 'react';
import { Link, useNavigate, useRouteError } from 'react-router-dom';

import { recordWebBreadcrumb } from '../lib/diagnosticsReporter.js';
import { IssueReporter } from './IssueReporter.js';
import styles from './LazyRouteBoundary.module.css';

// Browsers phrase a stale-chunk 404 differently (Chromium: "Failed to fetch dynamically
// imported module"; Firefox: "error loading dynamically imported module"; Safari:
// "Importing a module script failed"), but all three name the mechanism, not the module —
// matching on that is more durable than trying to enumerate every browser's exact wording.
const CHUNK_LOAD_ERROR_PATTERN = /dynamically imported module|importing a module script failed/i;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_LOAD_ERROR_PATTERN.test(message);
}

/**
 * `errorElement` for each lazily-loaded child route, not just the root `RootLayout` route
 * (`RouteErrorBoundary` in `NotFoundRoute.tsx`, still the top-level fallback for errors in
 * the shell itself). React Router walks up from the route that threw to the nearest
 * ancestor with an `errorElement`; giving every leaf route its own means a single route's
 * render crash only ever replaces that route's `<Outlet />` slot — `RootLayout`'s nav,
 * header, and footer stay mounted and usable underneath it.
 *
 * The common real-world trigger is a stale client after a deploy: the previous build's
 * `index.html` still references a chunk hash the new deploy no longer serves, so `import()`
 * 404s. No amount of in-app retry fixes that — only a full reload picks up the new
 * `index.html` — so that case gets its own message and a reload button instead of "try
 * again".
 */
export function LazyRouteBoundary(): JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const chunkLoadFailure = useMemo(() => isChunkLoadError(error), [error]);

  // React Router's errorElement swallows render errors before window.onerror sees them —
  // record the breadcrumb here so a `:report` bundle still carries what broke.
  useEffect(() => {
    recordWebBreadcrumb('window-error', message);
  }, [message]);

  return (
    <div className={styles['panel']} role="alert">
      <h2>{chunkLoadFailure ? 'Update available' : 'This page hit a snag'}</h2>
      <p className={styles['message']}>
        {chunkLoadFailure
          ? 'A new version of patches was deployed while this tab was open — reload to pick it up.'
          : message}
      </p>
      <div className={styles['actions']}>
        {chunkLoadFailure ? (
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        ) : (
          // navigate(0) re-runs the current route entry (React Router's documented
          // reload-in-place) rather than a full page reload, so it retries the failed
          // route's `lazy` import/render without dropping the rest of the app's state.
          <button type="button" onClick={() => navigate(0)}>
            Try again
          </button>
        )}
        <Link to="/">Go home</Link>
      </div>
      <IssueReporter variant="floating" autoOpen />
    </div>
  );
}
