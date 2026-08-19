import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  GUESTBOOK_ENTRY_MAX_CHARS,
  isPageValidationError,
  parsePageLenient,
  parsePageStrict,
  type PatchesPageView,
} from '@patches/domain';
import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, grpcStatusCode, type FriendlyError } from '../api/errors.js';
import { Loading } from '../components/Loading.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { editInExternalEditor, type EditInEditorOptions } from '../pages/editor.js';
import { FilePageDraftStore, type PageDraftStore } from '../pages/draft-store.js';
import { openLinkExternally } from '../pages/open-link.js';
import { collectLinks, PageBlocksView } from '../pages/render/blocks.js';
import { resolvePageTheme } from '../pages/render/theme.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';
import { PageBlocksEditorScreen } from './PageBlocksEditorScreen.js';

export interface PageScreenProps {
  api: PatchesApi;
  handle: string;
  /** Sub-page slug to resolve first — empty means "index" (mirrors `GetPageRequest`). */
  initialSlug?: string;
  /** The signed-in viewer's own actor id — enables `e` (edit) when it matches the
   * page's owner. */
  viewerActorId?: string | undefined;
  ensureAccessToken?: (() => Promise<string>) | undefined;
  isActive: boolean;
  /** True when this is the signed-in viewer's own page — a `NOT_FOUND` then means
   * "you have no page yet" and gets an empty starter document to edit, not an
   * error screen you cannot act on (owner feedback 2026-08-18: "pages didn't
   * work for me"). */
  isOwnPage?: boolean;
  /** Raised while a sub-mode of this screen owns the keyboard (signing the
   * guestbook, structured block editor) so `App`'s global keymap — `Esc` included —
   * steps aside instead of double-handling the keypress. */
  onCapturingInput?: ((capturing: boolean) => void) | undefined;
  env?: NodeJS.ProcessEnv;
  draftStore?: PageDraftStore | undefined;
  /** Test-only override for the `$EDITOR` round trip's `runEditor` (never a real
   * terminal hand-off in `apps/tui/test` — see `media/open-external.ts`'s `spawnFn`
   * for the same pattern). */
  editorOptions?: Pick<EditInEditorOptions, 'runEditor'> | undefined;
}

/** What `e`/`E` start from when you have no page yet — the smallest document
 * `parsePageStrict` accepts (§171), so the first save creates a real page. */
const EMPTY_PAGE_DOCUMENT = JSON.stringify(
  { version: 1, pages: [{ slug: 'home', title: 'Home', blocks: [] }] },
  undefined,
  2,
);

type FetchState =
  | { status: 'loading' }
  | {
      status: 'ready';
      ownerActorId: string;
      view: PatchesPageView;
      rawText: string;
      activeIndex: number;
    }
  | { status: 'error'; error: FriendlyError };

/**
 * `v` on a profile / `g v` for the caller's own — a Patches Page (P45-004/006, spec
 * §170–172): renders every sub-page's blocks, lets the viewer switch sub-pages and open
 * `Links` externally, sign the guestbook if signed in, and — if the viewer owns the page
 * — edit the raw document in `$VISUAL`/`$EDITOR` (`e`).
 */
export function PageScreen({
  api,
  handle,
  initialSlug = '',
  viewerActorId,
  ensureAccessToken,
  isActive,
  isOwnPage = false,
  onCapturingInput,
  env = process.env,
  draftStore,
  editorOptions,
}: PageScreenProps): ReactElement {
  const plain = usePlainMode();
  const [store] = useState<PageDraftStore>(() => draftStore ?? new FilePageDraftStore());
  // Keyed by `handle` and derived rather than reset synchronously at the top of the
  // fetch effect below (same "no setState-in-effect just to produce a value already
  // computable from props" pattern `ThreadScreen`'s `focus`/`useActor`'s outcome use) —
  // whenever `handle` changes, there is simply no stored state for it yet, so this
  // falls back to `loading` on its own.
  const [stored, setStored] = useState<{ handle: string; state: FetchState } | undefined>();
  const fetchState: FetchState = (stored?.handle === handle ? stored.state : undefined) ?? {
    status: 'loading',
  };
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | undefined>(undefined);
  const [guestbookRefreshKey, setGuestbookRefreshKey] = useState(0);
  const [signing, setSigning] = useState<string | undefined>(undefined);
  const [signError, setSignError] = useState<string | undefined>(undefined);
  const [editorNotice, setEditorNotice] = useState<string | undefined>(undefined);
  // Defined while `PageBlocksEditorScreen` (B-023) is showing — the raw document text
  // it should start from (an unsaved draft if there is one, else the server's last
  // known copy), same "prefer the draft" rule `openEditor` follows for `e`.
  const [blocksEditorText, setBlocksEditorText] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getPage({ handle, slug: initialSlug })
      .then((response) => {
        if (cancelled) return;
        const rawText = Buffer.from(response.document).toString('utf8');
        const view = parsePageLenient(JSON.parse(rawText) as unknown);
        const activeIndex = Math.max(
          0,
          view.pages.findIndex((subPage) => subPage.slug === response.activeSlug),
        );
        setStored({
          handle,
          state: {
            status: 'ready',
            ownerActorId: response.ownerActorId,
            view,
            rawText,
            activeIndex,
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          grpcStatusCode(error) === GrpcStatus.NOT_FOUND &&
          isOwnPage &&
          viewerActorId !== undefined
        ) {
          setStored({
            handle,
            state: {
              status: 'ready',
              ownerActorId: viewerActorId,
              view: parsePageLenient(JSON.parse(EMPTY_PAGE_DOCUMENT) as unknown),
              rawText: EMPTY_PAGE_DOCUMENT,
              activeIndex: 0,
            },
          });
          return;
        }
        setStored({
          handle,
          state: { status: 'error', error: describeGrpcError(error, api.target) },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [api, handle, initialSlug, isOwnPage, viewerActorId]);

  const isOwner =
    fetchState.status === 'ready' &&
    viewerActorId !== undefined &&
    viewerActorId === fetchState.ownerActorId;
  const canSign = ensureAccessToken !== undefined;

  const activeSubPage =
    fetchState.status === 'ready' ? fetchState.view.pages[fetchState.activeIndex] : undefined;
  const links = activeSubPage === undefined ? [] : collectLinks(activeSubPage.blocks);
  const hasGuestbook = activeSubPage?.blocks.some((block) => block.type === 'Guestbook') ?? false;

  function switchSubPage(delta: number): void {
    if (fetchState.status !== 'ready' || fetchState.view.pages.length <= 1) return;
    const next =
      (fetchState.activeIndex + delta + fetchState.view.pages.length) %
      fetchState.view.pages.length;
    setStored({ handle, state: { ...fetchState, activeIndex: next } });
    setSelectedLinkIndex(undefined);
  }

  async function openEditor(): Promise<void> {
    if (fetchState.status !== 'ready' || !isOwner || ensureAccessToken === undefined) return;
    const saved = await store.load();
    const initialText =
      saved !== undefined && saved.handle === handle ? saved.rawJson : fetchState.rawText;
    const result = await editInExternalEditor(initialText, { env, ...editorOptions });
    if (result.status === 'spawn-failed') {
      setEditorNotice("Couldn't open an editor — check $VISUAL/$EDITOR.");
      return;
    }
    if (result.text.trim() === initialText.trim()) {
      setEditorNotice(undefined);
      return;
    }
    let parsed;
    try {
      parsed = parsePageStrict(JSON.parse(result.text) as unknown);
    } catch (error) {
      await store.save({ handle, rawJson: result.text });
      const message = isPageValidationError(error)
        ? error.message
        : 'That is not valid JSON — press e to try again.';
      setEditorNotice(message);
      return;
    }
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.updatePage(
        { document: Buffer.from(JSON.stringify(parsed), 'utf8') },
        accessToken,
      );
      await store.clear();
      applyUpdatedDocument(response.document);
      setEditorNotice('Saved.');
    } catch (error) {
      await store.save({ handle, rawJson: result.text });
      setEditorNotice(describeGrpcError(error, api.target).title);
    }
  }

  /** `E` (B-023) — same "prefer an unsaved draft over the server's last-known copy"
   * rule `openEditor`'s `e` follows, but hands the resolved text to the structured
   * `PageBlocksEditorScreen` instead of `$EDITOR`. */
  async function openBlocksEditor(): Promise<void> {
    if (fetchState.status !== 'ready' || !isOwner || ensureAccessToken === undefined) return;
    const saved = await store.load();
    const initialText =
      saved !== undefined && saved.handle === handle ? saved.rawJson : fetchState.rawText;
    setBlocksEditorText(initialText);
    onCapturingInput?.(true);
  }

  /** Shared by `openEditor`'s and `PageBlocksEditorScreen`'s successful `UpdatePage` —
   * both hand back the same `document` bytes and both need this screen's `fetchState`
   * re-derived from them the same way. */
  function applyUpdatedDocument(document: Uint8Array): void {
    if (fetchState.status !== 'ready') return;
    const rawText = Buffer.from(document).toString('utf8');
    const view = parsePageLenient(JSON.parse(rawText) as unknown);
    setStored({
      handle,
      state: {
        status: 'ready',
        ownerActorId: fetchState.ownerActorId,
        view,
        rawText,
        activeIndex: Math.min(fetchState.activeIndex, Math.max(0, view.pages.length - 1)),
      },
    });
  }

  async function submitSignature(): Promise<void> {
    if (signing === undefined || signing.trim() === '' || ensureAccessToken === undefined) return;
    try {
      const accessToken = await ensureAccessToken();
      await api.signGuestbook(
        { handle, slug: activeSubPage?.slug ?? '', body: signing },
        accessToken,
      );
      setSigning(undefined);
      setSignError(undefined);
      onCapturingInput?.(false);
      setGuestbookRefreshKey((current) => current + 1);
    } catch (error) {
      setSignError(describeGrpcError(error, api.target).title);
    }
  }

  useInput(
    (input, key) => {
      if (signing !== undefined) {
        if (key.escape) {
          setSigning(undefined);
          setSignError(undefined);
          onCapturingInput?.(false);
          return;
        }
        if (key.return) {
          void submitSignature();
          return;
        }
        if (key.backspace || key.delete) {
          setSigning(signing.slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta || key.tab) return;
        if (input.length > 0 && signing.length < GUESTBOOK_ENTRY_MAX_CHARS) {
          setSigning(signing + input);
        }
        return;
      }

      // No `Esc` branch here: `App`'s navigation stack owns going back from every
      // screen, so a page pops exactly one level like everything else.
      if (input === '[') {
        switchSubPage(-1);
        return;
      }
      if (input === ']') {
        switchSubPage(1);
        return;
      }
      if ((input === 'j' || key.downArrow) && links.length > 0) {
        setSelectedLinkIndex((current) =>
          current === undefined ? 0 : Math.min(current + 1, links.length - 1),
        );
        return;
      }
      if ((input === 'k' || key.upArrow) && links.length > 0) {
        setSelectedLinkIndex((current) => (current === undefined ? 0 : Math.max(current - 1, 0)));
        return;
      }
      if (key.return && selectedLinkIndex !== undefined) {
        const link = links[selectedLinkIndex];
        if (link !== undefined) openLinkExternally(link.href, { env });
        return;
      }
      if (input === 'e') {
        void openEditor();
        return;
      }
      if (input === 'E') {
        void openBlocksEditor();
        return;
      }
      if (input === 's' && hasGuestbook && canSign) {
        setSigning('');
        setEditorNotice(undefined);
        onCapturingInput?.(true);
      }
    },
    { isActive: isActive && blocksEditorText === undefined },
  );

  if (fetchState.status === 'loading') {
    return (
      <Box>
        <Loading label="Loading page" />
      </Box>
    );
  }
  if (fetchState.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color={theme.error}>{fetchState.error.title}</Text>
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  if (blocksEditorText !== undefined && ensureAccessToken !== undefined) {
    return (
      <PageBlocksEditorScreen
        api={api}
        handle={handle}
        slug={activeSubPage?.slug ?? initialSlug}
        rawText={blocksEditorText}
        isActive={isActive}
        ensureAccessToken={ensureAccessToken}
        draftStore={store}
        onCancel={() => {
          setBlocksEditorText(undefined);
          onCapturingInput?.(false);
        }}
        onSaved={(response) => {
          applyUpdatedDocument(response.document);
          setBlocksEditorText(undefined);
          onCapturingInput?.(false);
          setEditorNotice('Saved.');
        }}
      />
    );
  }

  const resolved = resolvePageTheme(fetchState.view.theme, plain);
  const hints = [
    fetchState.view.pages.length > 1 ? '[ / ] sub-page' : undefined,
    links.length > 0 ? 'j/k select link · Enter open' : undefined,
    isOwner ? 'e edit · E structured edit' : undefined,
    hasGuestbook && canSign ? 's sign guestbook' : undefined,
    'Esc back',
  ].filter((hint): hint is string => hint !== undefined);

  return (
    <Box
      flexDirection="column"
      {...(resolved.border === undefined
        ? {}
        : { borderStyle: resolved.border, borderColor: resolved.accent ?? theme.accent })}
      paddingX={resolved.border === undefined ? 0 : 1}
    >
      <Box>
        <Text color={resolved.accent ?? theme.accent} bold>
          @{sanitizeForTerminal(handle)}
        </Text>
        {fetchState.view.pages.length > 1 ? (
          <Text color={theme.muted}>
            {'  '}
            {fetchState.view.pages
              .map((subPage, index) =>
                index === fetchState.activeIndex
                  ? `[${sanitizeForTerminal(subPage.title === '' ? subPage.slug : subPage.title)}]`
                  : sanitizeForTerminal(subPage.title === '' ? subPage.slug : subPage.title),
              )
              .join('  ')}
          </Text>
        ) : null}
      </Box>

      {activeSubPage === undefined || activeSubPage.blocks.length === 0 ? (
        <Box flexDirection="column">
          <Text color={theme.muted}>This page has no content yet.</Text>
          {isOwner ? (
            <Text color={theme.muted}>
              Press e to write it in $EDITOR, or E for the block editor.
            </Text>
          ) : null}
        </Box>
      ) : (
        <PageBlocksView
          blocks={activeSubPage.blocks}
          context={{
            api,
            handle,
            slug: activeSubPage.slug,
            ownerActorId: fetchState.ownerActorId,
            guestbookRefreshKey,
          }}
          selectedLinkIndex={selectedLinkIndex}
        />
      )}

      {signing === undefined ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Sign guestbook: {sanitizeForTerminal(signing)}
            <Text color={theme.accent}>█</Text>
          </Text>
          {signError === undefined ? null : <Text color={theme.error}>{signError}</Text>}
          <Text color={theme.muted}>Enter submit · Esc cancel</Text>
        </Box>
      )}

      {editorNotice === undefined ? null : (
        <Text color={editorNotice === 'Saved.' ? theme.ok : theme.error}>
          {sanitizeForTerminal(editorNotice)}
        </Text>
      )}

      <Box marginTop={1}>
        <Text color={theme.muted}>{hints.join(' · ')}</Text>
      </Box>
    </Box>
  );
}
