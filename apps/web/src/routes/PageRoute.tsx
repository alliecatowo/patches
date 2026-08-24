import { Code, ConnectError } from '@connectrpc/connect';
import { describeError } from '@patches/client';
import { sanitizeText } from '@patches/domain';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { PageBlocks } from '../components/PageBlocks.js';
import { PinnedPosts } from '../components/PinnedPosts.js';
import { decodePageDocument, safePageThemeColor } from '../lib/page.js';
import styles from './PageRoute.module.css';

/**
 * `/page/:handle[/:slug]` — the read-only web view of a Patches Page (spec §170–172,
 * B-064): the same document the TUI's `v` screen renders, as inert React via
 * `PageBlocks`. Anonymous-friendly like `GetPage` itself; editing stays on the TUI /
 * the profile wall dialog.
 *
 * The document's `theme` (§171) applies document-wide as `--page-*` CSS custom
 * properties scoped to this route container — accent/background/border are cosmetics
 * and never gate any function (Amendment B §184.3). Every value passes
 * `safePageThemeColor`; an unsafe or unrecognized value just means the node's own
 * default theme renders instead.
 */
export function PageRoute(): JSX.Element {
  const { handle: routeHandle, slug: routeSlug } = useParams<{
    handle: string;
    slug: string;
  }>();
  const handle = routeHandle?.startsWith('@') === true ? routeHandle.slice(1) : (routeHandle ?? '');
  const slug = routeSlug ?? '';

  const pageQuery = useQuery({
    queryKey: ['page', handle, slug],
    queryFn: () => api.pages.getPage({ handle, slug }),
    enabled: handle !== '',
    retry: false,
    staleTime: 30_000,
  });

  if (handle === '') {
    return <p className={styles['empty']}>No page handle given.</p>;
  }
  if (pageQuery.isPending) return <p className={styles['empty']}>Loading page…</p>;

  if (pageQuery.isError) {
    const error = ConnectError.from(pageQuery.error);
    if (error.code === Code.NotFound) {
      return (
        <div className={styles['empty']}>
          <p>@{handle} doesn&apos;t have a page here yet.</p>
          <p className={styles['emptyActions']}>
            <Link to={`/@${handle}`}>Back to their profile</Link>
          </p>
        </div>
      );
    }
    return <p className={styles['error']}>{describeError(pageQuery.error).message}</p>;
  }

  const response = pageQuery.data;
  const view = decodePageDocument(response.document);
  if (view === null) {
    return <p className={styles['empty']}>This page couldn&apos;t be displayed.</p>;
  }

  // The server resolves an empty request slug to the index sub-page and reports it back
  // (`GetPageResponse.active_slug`); match it to a document sub-page, falling back to
  // the first one — same resolution the TUI's PageScreen does.
  const activeSubPage =
    view.pages.find((subPage) => subPage.slug === response.activeSlug) ?? view.pages[0];
  if (activeSubPage === undefined) {
    return <p className={styles['empty']}>This page has no content yet.</p>;
  }

  // Custom properties aren't in React.CSSProperties' known keys — this record only ever
  // holds color values that passed safePageThemeColor (undefined drops the property).
  const themeVars = {
    '--page-accent':
      view.theme?.accent === undefined ? undefined : safePageThemeColor(view.theme.accent),
    '--page-bg':
      view.theme?.background === undefined ? undefined : safePageThemeColor(view.theme.background),
  } as CSSProperties;

  return (
    <div className={`${styles['page']} ${themeBorderClass(view.theme?.border)}`} style={themeVars}>
      <header className={styles['header']}>
        <p className={styles['crumbs']}>
          <Link to={`/@${handle}`}>@{sanitizeText(handle)}</Link> · page
        </p>
        <h1 className={styles['title']}>
          {sanitizeText(activeSubPage.title === '' ? activeSubPage.slug : activeSubPage.title)}
        </h1>
      </header>

      {view.pages.length > 1 ? (
        <nav aria-label="Sub-pages">
          <ul className={styles['subPages']}>
            {view.pages.map((subPage) => (
              <li key={subPage.slug}>
                <Link
                  to={`/page/@${handle}/${subPage.slug}`}
                  className={`${styles['subPageTab']} ${
                    subPage.slug === activeSubPage.slug ? styles['subPageTabActive'] : ''
                  }`}
                >
                  {sanitizeText(subPage.title === '' ? subPage.slug : subPage.title)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {/* The owner's pinned strip sits above every sub-page's blocks, like the TUI's. */}
      <PinnedPosts ownerActorId={response.ownerActorId} />

      {activeSubPage.blocks.length > 0 ? (
        <PageBlocks
          blocks={activeSubPage.blocks}
          context={{
            handle,
            slug: activeSubPage.slug,
            ownerActorId: response.ownerActorId,
          }}
        />
      ) : (
        <p className={styles['empty']}>This page has no content yet.</p>
      )}
    </div>
  );
}

/** §171's border enum (`packages/domain`'s `PAGE_BORDER_STYLES`: single/double/round/
 * ascii/none) → CSS borders on the page container; `round` is the TUI box's rounded
 * cousin, `ascii` renders dashed. Unknown values render unbordered. */
function themeBorderClass(border: string | undefined): string {
  switch (border) {
    case 'single':
      return styles['themeBorderSingle'] ?? '';
    case 'double':
      return styles['themeBorderDouble'] ?? '';
    case 'round':
      return styles['themeBorderRound'] ?? '';
    case 'ascii':
      return styles['themeBorderAscii'] ?? '';
    default:
      return '';
  }
}
