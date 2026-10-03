import type { JSX, ReactNode } from 'react';

import { safePageHref } from '../lib/page.js';

/**
 * Anchor for a URL that came from the server or another node (profile website, device-flow
 * verification URI, ...). The server validates at write time, but federated or legacy rows
 * and any future validation regression must not become a `javascript:` link in the origin
 * that holds the session tokens, so the scheme is re-checked at render. A URL that fails
 * the allowlist renders as inert text.
 */
export function SafeExternalLink({
  href,
  children,
}: {
  href: string;
  children?: ReactNode;
}): JSX.Element {
  const safe = safePageHref(href);
  if (safe === null) return <span>{children ?? href}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer ugc">
      {children ?? safe}
    </a>
  );
}
