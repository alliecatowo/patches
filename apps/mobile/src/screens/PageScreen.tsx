import { Code, ConnectError } from '@connectrpc/connect';
import { describeError } from '@patches/client';
import type { PatchesPageView } from '@patches/domain';
import { useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api/client.js';
import { PageBlocks } from '../components/PageBlocks.js';
import { decodePageDocument, resolveActiveSubPage } from '../pages/document.js';
import { subPageTabLabel } from '../pages/view.js';

export interface PageScreenProps {
  /** Page owner's local handle, no leading `@`. */
  handle: string;
  onBack: () => void;
}

type PageState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; view: PatchesPageView; ownerActorId: string; activeSlug: string };

/**
 * Read-only viewer for a user's Patches Page/wall (spec §170–172, B-082) — the mobile
 * peer of the web `PageRoute` and the TUI `v` screen. Fetches via the same
 * `PageService.GetPage` RPC (whole document, empty slug = index; the server reports the
 * resolved `active_slug` back), decodes/validates with the shared `@patches/domain`
 * parser, and renders blocks inertly — editing and guestbook signing stay on the
 * TUI/web. Sub-pages are a simple segment state over the already-fetched document;
 * switching never refetches (only slug-keyed live blocks like Guestbook do).
 */
export function PageScreen({ handle, onBack }: PageScreenProps): JSX.Element {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api.pages
      .getPage({ handle, slug: '' })
      .then((response) => {
        if (cancelled) return;
        const view = decodePageDocument(response.document);
        if (view === null) {
          setState({ status: 'failed', message: "This page couldn't be displayed." });
          return;
        }
        const active = resolveActiveSubPage(view, response.activeSlug);
        if (active === null) {
          setState({ status: 'failed', message: 'This page has no content yet.' });
          return;
        }
        setState({
          status: 'ready',
          view,
          ownerActorId: response.ownerActorId,
          activeSlug: active.slug,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ConnectError && error.code === Code.NotFound) {
          setState({ status: 'missing' });
          return;
        }
        setState({ status: 'failed', message: describeError(error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.crumbs} numberOfLines={1}>
          {`@${handle} · page`}
        </Text>
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}
      {state.status === 'missing' ? (
        <Text style={styles.empty}>{`@${handle} doesn't have a page here yet.`}</Text>
      ) : null}
      {state.status === 'failed' ? <Text style={styles.error}>{state.message}</Text> : null}
      {state.status === 'ready' ? <ReadyPage state={state} handle={handle} /> : null}
    </View>
  );
}

function ReadyPage({
  state,
  handle,
}: {
  state: Extract<PageState, { status: 'ready' }>;
  handle: string;
}): JSX.Element {
  const [activeSlug, setActiveSlug] = useState(state.activeSlug);
  const active =
    state.view.pages.find((subPage) => subPage.slug === activeSlug) ?? state.view.pages[0];
  if (active === undefined) {
    return <Text style={styles.empty}>This page has no content yet.</Text>;
  }

  return (
    <View style={styles.content}>
      {state.view.pages.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subPages}>
          {state.view.pages.map((subPage) => (
            <TouchableOpacity
              key={subPage.slug}
              onPress={() => setActiveSlug(subPage.slug)}
              style={subPage.slug === active.slug ? styles.subPageTabActive : styles.subPageTab}
            >
              <Text
                style={
                  subPage.slug === active.slug ? styles.subPageLabelActive : styles.subPageLabel
                }
              >
                {subPageTabLabel(subPage)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <Text style={styles.title}>{subPageTabLabel(active)}</Text>
      <ScrollView>
        {/* Keyed by slug so slug-keyed live blocks (Guestbook) refetch on sub-page switch. */}
        <PageBlocks
          key={active.slug}
          blocks={active.blocks}
          context={{ handle, slug: active.slug, ownerActorId: state.ownerActorId }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  back: { color: '#7c9cff', fontWeight: '700' },
  crumbs: { color: '#888', flexShrink: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#888', padding: 24, textAlign: 'center' },
  error: { color: '#ff6b6b', padding: 24 },
  content: { flex: 1 },
  subPages: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  subPageTab: { paddingHorizontal: 14, paddingVertical: 10 },
  subPageTabActive: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#7c9cff',
  },
  subPageLabel: { color: '#888' },
  subPageLabelActive: { color: '#fff', fontWeight: '700' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14 },
});
