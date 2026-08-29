import { randomUUID } from 'node:crypto';

import { Box, Text, useApp, useInput, useStdin, useStdout, useWindowSize, type Key } from 'ink';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { create } from '@bufbuild/protobuf';
import { PostCountsSchema, PostViewerStateSchema } from '@patches/proto/es';

import { FOLLOW_STATE } from '../api/wire/enums.js';
import type { Actor, MediaAttachment, Post } from '../api/wire/types.js';

import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import { describeGrpcError } from '../api/errors.js';
import type { CredentialStore } from '../auth/credential-store.js';
import { SessionManager, type ActiveSession } from '../auth/session.js';
import { wipeE2eeState, type RatchetSessionVault } from '../e2ee/ratchet-vault.js';
import type { InboxRow as E2eeReceivedRow } from '../e2ee/runtime.js';
import { verifyActorChain } from '../e2ee/chain.js';
import { verifyGroupControlEvents } from '../e2ee/group-control.js';
import { createVaultE2eeSender, type VaultE2eeSender, type E2eeVaultFault } from './e2ee-send.js';
import { createEnrollmentTransport, createE2eeTransports } from './e2ee-transports.js';
import { ENROLLMENT_PEER_WARNING_COPY } from '../e2ee/enrollment.js';
import type { LocalDeviceIdentity } from '../e2ee/local-identity.js';
import { FileDraftStore, type ComposeDraft, type DraftStore } from '../compose/draft-store.js';
import type { PageDraftStore } from '../pages/draft-store.js';
import type { PostRowActions } from '../components/PostList.js';
import { HintLine, StatusBar } from '../components/StatusBar.js';
import { LinearModeProvider } from '../hooks/useLinearMode.js';
import { NowProvider } from '../hooks/useNow.js';
import { TerminalTooSmall } from '../components/TerminalTooSmall.js';
import { ToastLine, type Toast, type ToastKind } from '../components/Toast.js';
import { clearListCache } from '../hooks/usePaginatedPosts.js';
import { useServerInfo } from '../hooks/useServerInfo.js';
import { useUnreadCount } from '../hooks/useUnreadCount.js';
import { MediaCache } from '../media/cache.js';
import { MediaSessionProvider } from '../media/media-session.js';
import { openMediaExternally, type OpenMediaOptions } from '../media/open-external.js';
import { openLinkExternally } from '../pages/open-link.js';
import { AccountsScreen } from '../screens/AccountsScreen.js';
import { ActorListScreen } from '../screens/ActorListScreen.js';
import { AppealsScreen } from '../screens/AppealsScreen.js';
import { BookmarksScreen } from '../screens/BookmarksScreen.js';
import { ComposeScreen } from '../screens/ComposeScreen.js';
import { DevicesScreen } from '../screens/DevicesScreen.js';
import { LinkThisDeviceScreen } from '../screens/LinkThisDeviceScreen.js';
import { SafetyNumberScreen } from '../screens/SafetyNumberScreen.js';
import { EditProfileScreen } from '../screens/EditProfileScreen.js';
import { FilterListsScreen } from '../screens/FilterListsScreen.js';
import { FiltersScreen } from '../screens/FiltersScreen.js';
import { FollowRequestsScreen } from '../screens/FollowRequestsScreen.js';
import { HelpScreen } from '../screens/HelpScreen.js';
import { LabelersScreen } from '../screens/LabelersScreen.js';
import { PostHistoryScreen } from '../screens/PostHistoryScreen.js';
import { LocalScreen } from '../screens/LocalScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import {
  MessagesScreen,
  type E2eeDrain,
  type MessagesScreenApi,
} from '../screens/MessagesScreen.js';
import { ModerationLogScreen } from '../screens/ModerationLogScreen.js';
import { NotificationsScreen } from '../screens/NotificationsScreen.js';
import { PageScreen, type PageScreenProps } from '../screens/PageScreen.js';
import { PrivacyScreen } from '../screens/PrivacyScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { ReportScreen, type ReportTarget } from '../screens/ReportScreen.js';
import { IssueReportScreen } from '../screens/IssueReportScreen.js';
import { attachFrameCapture } from '../diagnostics/frame-capture.js';
import { getDiagnosticsReporter } from '../diagnostics/reporter.js';
import { SearchScreen } from '../screens/SearchScreen.js';
import { TagFeedScreen } from '../screens/TagFeedScreen.js';
import { ThreadScreen } from '../screens/ThreadScreen.js';
import { CommandPalette, type PaletteInvocation } from '../components/CommandPalette.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { Drawer } from '../components/Drawer.js';
import { Overlay } from '../components/Overlay.js';
import { SplitPane } from '../components/SplitPane.js';
import { MediaViewerScreen } from '../screens/MediaViewerScreen.js';
import { PreferencesScreen } from '../screens/PreferencesScreen.js';
import {
  FilePreferenceStore,
  type ImagePolicy,
  type PreferenceStore,
} from '../preferences/store.js';
import { FileSavedViewsStore, type SavedViewsStore } from '../views/saved-views-store.js';
import { BUILT_IN_THEMES, getBuiltInTheme } from '../theme/themes/registry.js';
import { resolveTheme } from '../theme/themes/resolution.js';
import type { BuiltInThemeName, ThemeDefinition } from '../theme/themes/types.js';
import { ActiveThemeProvider } from './theme-context.js';
import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { resolveGlyphSet } from '../theme/glyphs.js';
import type { GlyphSetName } from '../theme/themes/types.js';
import { isTruthy } from '../env.js';
import { CommandHistory, contextualCommands, type ContextualSelection } from './commands.js';
import {
  createKeyLayerStack,
  isCoalescedKeyRun,
  isCtrlKey,
  isPaletteShortcut,
  KeyLayerProvider,
  legacyInputConsumes,
  splitCoalescedKeyRun,
} from './input.js';
import { hintsFor, SCREEN_TITLES, type Binding, type Screen } from './keymap.js';
import { chromeSplit, ContentSizeProvider, FOOTER_ROWS, InlineImagesProvider } from './layout.js';
import {
  breadcrumbSegmentLimit,
  DRAWER_COLUMNS,
  drawerAvailable,
  planResponsiveLayout,
} from './responsive-layout.js';
import { presentationFor, wantsSplit } from './routes.js';
import { ModalStackProvider, useModalStackController } from './modal.js';
import type { ListJump } from './list-movement.js';
import {
  canGoBack,
  currentEntry,
  replace,
  jump,
  pop,
  push,
  reset,
  rootEntry,
  type NavEntry,
  type NavStack,
} from './navigation.js';

export interface AppProps {
  api: PatchesApi;
  credentialStore: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
  /** Overridden in tests — a real `MediaCache` writes to the user's XDG cache dir. */
  mediaCache?: MediaCache;
  /** Threaded into every `o` (open externally) call — tests inject `spawnFn` here to
   * record the call instead of actually launching an OS opener (spec §76). */
  openMediaOptions?: OpenMediaOptions;
  /** Threaded into `PageScreen`'s `e` (edit) flow — tests inject `runEditor` here
   * instead of actually spawning `$EDITOR` against a real TTY (P45-006). */
  pageEditorOptions?: PageScreenProps['editorOptions'];
  /** Overridden in tests — a real `FilePageDraftStore` writes to the user's XDG data dir. */
  pageDraftStore?: PageDraftStore;
  /** Overridden in tests — a real `FilePreferenceStore` writes to the user's XDG config dir. */
  preferenceStore?: PreferenceStore;
  /** #192: overridden in tests — a real `FileSavedViewsStore` writes to the user's XDG
   * config dir. */
  savedViewsStore?: SavedViewsStore;
  /** `patches visit @handle[/slug]` (P45-006) — opens straight to that actor's
   * Patches Page, one level above the timeline so `Esc` still lands somewhere. */
  initialPageTarget?: { handle: string; slug: string } | undefined;
}

/** Optimistic overlay for one post's reaction state (P4-004, spec §79) — only the
 * fields a toggle actually changes; everything else keeps the server's last value. */
interface ReactionOverride {
  liked?: boolean;
  bookmarked?: boolean;
  reposted?: boolean;
  likes?: number;
  reposts?: number;
}

/** The quick-post overlay's box (`tui-interaction-model.md` §3.4: `min(72, columns-8)`
 * wide, 6–10 rows). Clamped into the region by `placeOverlay`. */
const QUICK_POST_COLUMNS = 72;
const QUICK_POST_ROWS = 10;
/** The command palette's box — wider than a confirm, shorter than a screen. */
const PALETTE_COLUMNS = 72;
const PALETTE_ROWS = 12;
/** How long a manual refresh (`Ctrl+R`, `:reload`) shows a spinner in the ribbon's
 * connection slot (P12-117's "finite refresh spinner") — long enough to read, and
 * always cleared by its own timer regardless of how the refresh itself resolves. */
const REFRESH_PULSE_MS = 900;

function emptyDraft(): ComposeDraft {
  return { body: '', clientRequestId: randomUUID() };
}

/** A fresh reply draft for `target` — never continues a different draft's text into a
 * new reply target (P4-004: "draft per reply target"). */
function replyDraft(target: Post): ComposeDraft {
  return {
    body: '',
    clientRequestId: randomUUID(),
    inReplyToId: target.id,
    replyingToHandle: target.author?.handle ?? target.author?.id ?? '',
  };
}

function quoteDraft(target: Post): ComposeDraft {
  return {
    body: '',
    clientRequestId: randomUUID(),
    quotedPostId: target.id,
    quotingHandle: target.author?.handle ?? target.author?.id ?? '',
  };
}

/** After signing in, a stack rooted on the local timeline should be rooted on home
 * instead — without throwing away wherever the viewer had navigated to. */
function promoteRootToHome(stack: NavStack): NavStack {
  if (stack[0].screen !== 'local') return stack;
  return [{ screen: 'home' }, ...stack.slice(1)] as unknown as NavStack;
}

export function App({
  api,
  credentialStore,
  draftStore,
  env = process.env,
  initialPageTarget,
  mediaCache,
  preferenceStore,
  savedViewsStore,
  openMediaOptions,
  pageEditorOptions,
  pageDraftStore,
}: AppProps): ReactElement {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { columns, rows } = useWindowSize();
  const { stdout } = useStdout();
  const { state: serverInfoState, retry: retryServerInfo } = useServerInfo(api);

  // The navigation stack (see `navigation.ts`). Patches opens straight onto a
  // timeline — the local one while signed out, home once a stored session restores
  // (owner feedback 2026-08-18: "help screen up by default entering, it should auto
  // show home screen"). Connection state lives in the status bar, not a splash.
  const [stack, setStack] = useState<NavStack>(() =>
    initialPageTarget === undefined
      ? reset(rootEntry(false))
      : [
          rootEntry(false),
          {
            screen: 'page',
            handle: initialPageTarget.handle,
            slug: initialPageTarget.slug,
          },
        ],
  );
  const entry = currentEntry(stack);
  const screen: Screen = entry.screen;
  const inputLayers = useMemo(() => createKeyLayerStack(), []);
  const modals = useModalStackController();
  const [commandHistory] = useState(() => new CommandHistory());
  // True once the viewer has pressed a navigation key — after that, a session
  // restoring in the background must not yank them somewhere else.
  const navigated = useRef(false);
  // Raised by a screen whose *sub-mode* owns the keyboard (PageScreen's guestbook
  // signing, its block editor) — without it, `Esc` would both cancel the sub-mode and
  // pop the navigation stack.
  const [, setLegacySubmodeState] = useState(false);
  const legacySubmodeActiveRef = useRef(false);
  function setLegacySubmodeActive(active: boolean): void {
    legacySubmodeActiveRef.current = active;
    setLegacySubmodeState(active);
  }
  // `g g` — the shell owns the `g` prefix, so the jump is handed to whichever list is
  // showing rather than handled by it. `G` (bottom) needs no prefix and is handled by
  // the list itself (`list-movement.ts`).
  const [listJump, setListJump] = useState<ListJump | undefined>(undefined);
  // Bumped after any successful post, so the timeline/thread you land on re-reads
  // itself and your new post is actually there.
  const [feedNonce, setFeedNonce] = useState(0);

  const [toast, setToast] = useState<Toast | undefined>(undefined);
  // Mirrored in a ref, and the ref is what the input handler reads. Ink delivers every
  // key in one stdin chunk through the *same* handler closure, so a `g` and an `h`
  // typed fast enough to arrive together would both see the pre-`g` state value and the
  // jump would silently do nothing (reproduced under tmux, QA 2026-08-19).
  const [pendingGo, setPendingGoState] = useState(false);
  const pendingGoRef = useRef(false);
  const pendingGoTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  // Set by `Ctrl+G` (vs. plain `g`) before the prefix's second key lands — B-042's
  // explicit "open beside" request. Read once by the one destination that cares (`v`)
  // and cleared on every fresh prefix press.
  const pendingGoAllowSplitRef = useRef(false);
  // Set by `Ctrl+W` before its second key (`h`/`l`) lands — B-048's directional alias
  // to `Tab` (`h` focuses primary, `l` focuses secondary). Same coalesced-chunk hazard
  // as `g <key>`/`Ctrl+G` above, so it gets its own ref+timer pair rather than reusing
  // `pendingGoRef`; `splitCoalescedKeyRun` (`input.tsx`) is what makes a fast-typed
  // `Ctrl+W`+`h` chunk still recognise the ctrl chord.
  const pendingPaneRef = useRef(false);
  const pendingPaneTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const refreshPulseTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  // B-112 follow-up: Ink has no stop-propagation, so one keypress reaches every
  // active listener — and a list's listener subscribes (child effect) before the
  // shell's own, meaning a focused row's targeted `!` (`PostList` → `reportPost`,
  // `ProfileScreen` → `reportActor`, both funnelled through `openReport`) fires
  // *before* `handleShellInput` sees the same key. That claim suppresses the
  // shell's global issue reporter for exactly that one keypress — it is set only
  // when the targeted report actually opens (a screen must not claim the key
  // forever just because `!` means something there), and it expires on a zero-delay
  // timeout, after the current stdin event's synchronous fan-out, so an earlier
  // targeted report can never swallow a later, unrelated `!`.
  const targetedBangClaimedRef = useRef(false);
  const targetedBangClaimTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  function claimTargetedBang(): void {
    targetedBangClaimedRef.current = true;
    clearTimeout(targetedBangClaimTimer.current);
    targetedBangClaimTimer.current = setTimeout(() => {
      targetedBangClaimedRef.current = false;
    }, 0);
  }
  function setPendingGo(next: boolean): void {
    pendingGoRef.current = next;
    setPendingGoState(next);
  }
  // Spec §173's required "plain mode that strips all decoration" — starts from
  // `PATCHES_PLAIN`/`--plain` (`env` is normalized by `cli.tsx`) and is toggleable at
  // runtime with `P` (below).
  const [plain, setPlain] = useState(() => isTruthy(env.PATCHES_PLAIN));
  const [quiet, setQuiet] = useState(false);
  // P12-118's linear/screen-reader mode — `PATCHES_LINEAR`/`--linear` (normalized into
  // env the same way `--plain` is) or `:linear`. One column, no overlays/drawers (they
  // fall back to full-screen takeovers), indexed list rows, and plain mode implied
  // (`plainEffective` below) — never a *second*, independent "is decoration off"
  // switch a screen would have to check in addition to `plain`.
  const [linearMode, setLinearMode] = useState(() => isTruthy(env.PATCHES_LINEAR));
  const plainEffective = plain || linearMode;
  // The saved preference this session's renderer was actually built from (P12-113,
  // `cli.tsx`'s own env > saved > auto read, before this component ever mounts) — not
  // reapplied live here, since swapping the terminal-media renderer's kind mid-session
  // means safely tearing down any in-flight Kitty placements first. The Preferences row
  // edits this as a plain preference: it is what the *next* launch picks up.
  const [imagePolicy, setImagePolicy] = useState<ImagePolicy>('auto');
  // Glyph set (P12-103) — `PATCHES_GLYPHS` > saved preference > auto (unicode unless the
  // locale isn't UTF-8). Never auto-selects `nerd` (design vision §3.5). Was previously
  // resolved nowhere: the Preferences row cycled a value that never left the screen it was
  // opened from and no renderer ever read it (B-047) — `MessagesScreen`'s one glyph call
  // site below is threaded from this state the same way `plain`/`quiet` already are.
  const [glyphSet, setGlyphSet] = useState<GlyphSetName>(() =>
    resolveGlyphSet({ envGlyphSet: env.PATCHES_GLYPHS, locale: env.LC_ALL ?? env.LANG }),
  );

  // --- theme engine (P12-101/P12-127) --------------------------------------
  // Precedence is resolved once, purely, in `theme/themes/resolution.ts`:
  // `--theme` > `PATCHES_THEME` > the saved local profile > the actor profile >
  // `patches`. `cli.tsx` normalises `--theme` into `PATCHES_THEME` the same way it
  // already normalises `--plain` into `PATCHES_PLAIN`, so the shell only ever reads
  // env plus whatever the local store returns.
  const initialThemeResolution = useState(() =>
    resolveTheme({ envTheme: env.PATCHES_THEME ?? null }),
  )[0];
  const [themeName, setThemeName] = useState<BuiltInThemeName>(() =>
    initialThemeResolution.ok ? initialThemeResolution.theme.name : 'patches',
  );
  const [themeSource, setThemeSource] = useState<string>(() =>
    initialThemeResolution.ok ? initialThemeResolution.source : 'default',
  );
  const activeTheme: ThemeDefinition = getBuiltInTheme(themeName) ?? BUILT_IN_THEMES.patches;
  const [preferences] = useState<PreferenceStore>(
    () => preferenceStore ?? new FilePreferenceStore(),
  );
  const [savedViews] = useState<SavedViewsStore>(
    () => savedViewsStore ?? new FileSavedViewsStore(),
  );
  /** What `Esc` on the preferences screen restores (P12-112). */
  const revertPreferences = useRef<
    | {
        theme: BuiltInThemeName;
        plain: boolean;
        quiet: boolean;
        imagePolicy: ImagePolicy;
        glyphSet: GlyphSetName;
        linearMode: boolean;
      }
    | undefined
  >(undefined);

  // The notifications drawer (`N`, P12-024). Presentation state, deliberately not
  // navigation state: it never enters the stack, so `Esc` semantics are untouched.
  const [drawerRequested, setDrawerRequested] = useState(false);
  // The direct-message drawer (`Ctrl+D`, P12-122) — same shape as the notifications
  // drawer, mutually exclusive with it (both share the one `DRAWER_COLUMNS` slice the
  // shell subtracts from the content region; two drawers open at once was never a
  // presentation this layout budgeted for).
  const [dmDrawerRequested, setDmDrawerRequested] = useState(false);
  // `Tab` moves shell focus between the primary and secondary pane of a split
  // (B-046 — keymap.ts's `Tab` binding, user-guide.md's keymap table). Action keys
  // (`E`, `l`, `r`, …) dispatch only to whichever pane is focused — `renderEntry`
  // below gates each pane's own `useInput` on exactly this — and the focused pane's
  // title is marked `>` (`SplitPane`) so which one is live is visible without
  // guessing. Purely presentational — it never touches the navigation stack.
  const [paneFocusSecondary, setPaneFocusSecondary] = useState(false);
  // A manual refresh's bounded ribbon spinner (P12-117) — always cleared by its own
  // timer, never left spinning by whatever the refresh itself resolves to.
  const [refreshing, setRefreshing] = useState(false);

  const [sessionManager] = useState(
    () => new SessionManager({ api, store: credentialStore, nodeOrigin: api.target }),
  );
  const [session, setSession] = useState<ActiveSession | undefined>(sessionManager.session);
  // Stable across renders (sessionManager is a `useState` initializer) — passed to
  // screens that key an effect off it (`ProfileScreen`'s relationship fetch); an
  // inline `() => sessionManager.ensureAccessToken()` would be a new function every
  // render and re-trigger that effect on every keystroke.
  const ensureAccessToken = useCallback(() => sessionManager.ensureAccessToken(), [sessionManager]);

  const [store] = useState<DraftStore>(() => draftStore ?? new FileDraftStore());
  const [draft, setDraft] = useState<ComposeDraft>(emptyDraft);

  // One cache/session for the whole app (spec §32) — `useMemo` so `MediaAttachments`'
  // fetch effect (keyed on this object's identity) doesn't refire every render.
  const [cache] = useState<MediaCache>(() => mediaCache ?? new MediaCache());
  const mediaSession = useMemo(
    () => ({ api, cache, ensureAccessToken }),
    [api, cache, ensureAccessToken],
  );

  // `MessagesScreenApi` is promise-based with no `accessToken` parameter — the screen
  // is meant to be reusable against an already-authenticated transport (its own doc
  // comment). `PatchesApi`'s DM methods, like every other authenticated call on it,
  // take the token explicitly, so this binds `ensureAccessToken()` in front of each one
  // rather than widening the screen's own contract (P12-122).
  const messagesApi: MessagesScreenApi = useMemo(
    () => ({
      listConversations: (request) =>
        ensureAccessToken().then((accessToken) => api.listConversations(request, accessToken)),
      getConversation: (request) =>
        ensureAccessToken().then((accessToken) => api.getConversation(request, accessToken)),
      markConversationRead: (request) =>
        ensureAccessToken().then((accessToken) => api.markConversationRead(request, accessToken)),
      // P13-010 security surfaces — optional in the screen's contract, always bound
      // here where the authenticated transport exists.
      getIdentityRoot: (request) =>
        ensureAccessToken().then((accessToken) => api.getIdentityRoot(request, accessToken)),
      getDeviceRoster: (request) => api.getDeviceRoster(request),
      listE2eeGroupControlEvents: (request) =>
        ensureAccessToken().then((accessToken) =>
          api.listE2eeGroupControlEvents(request, accessToken),
        ),
      // B-101: the membership transcript is signature-verified client-side before the
      // screen renders it — each event against its signer's certified device key, loaded
      // from that actor's verified root → roster → certificate chain. A chain that
      // cannot be verified fails its rows closed (`signatureVerified: false`), never
      // silently passes them.
      verifyGroupControlEvents: async ({ conversationId }) => {
        const accessToken = await ensureAccessToken();
        const response = await api.listE2eeGroupControlEvents(
          { conversationId, afterEpoch: 0n, limit: 50 },
          accessToken,
        );
        const verdict = await verifyGroupControlEvents(response.events, {
          loadVerifiedChain: async (actorId) => {
            const [rootResponse, rosterResponse] = await Promise.all([
              api.getIdentityRoot({ actorId }, accessToken),
              api.getDeviceRoster({ actorId }),
            ]);
            if (rootResponse.identityRoot === undefined || rosterResponse.roster === undefined) {
              return undefined;
            }
            return verifyActorChain({
              rootWire: rootResponse.identityRoot,
              rosterWire: rosterResponse.roster,
              certificatesWire: rosterResponse.certificates ?? [],
              now: new Date(),
            });
          },
        });
        return { allVerified: verdict.allVerified, rows: verdict.rows };
      },
    }),
    [api, ensureAccessToken],
  );

  // This node's DM retention window, for `MessagesScreen`'s retention copy (P12-114,
  // spec §197.6) — best-effort, public (no session/`accessToken`), fetched once. Stays
  // `undefined` (never fabricated) until it resolves, and forever if the node publishes
  // no policy or the request fails — the screen already renders nothing about
  // retention rather than guess when this is absent.
  const [dmRetentionDays, setDmRetentionDays] = useState<number | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void api.getNodePolicy().then(
      (response) => {
        if (cancelled) return;
        const days = response.policy?.retention?.dmRetentionDays;
        if (days !== undefined) setDmRetentionDays(days);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  // This node's E2EE capability state (P13-010) — best-effort, public, fetched once.
  // Drives ADR 0027's persistent development-mode warning on conversation surfaces.
  const [e2eeCapabilityState, setE2eeCapabilityState] = useState<number | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void api.getE2eeCapability({}).then(
      (response) => {
        if (cancelled) return;
        const capabilityState = response.capability?.state;
        if (capabilityState !== undefined) setE2eeCapabilityState(capabilityState);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Safety numbers compared and confirmed this session (`v` on the safety-number
  // screen). Session-scoped: this client keeps no persistent verified-state store yet,
  // so it renders exactly what it knows and nothing more.
  const [verifiedPeers, setVerifiedPeers] = useState<ReadonlySet<string>>(new Set());
  function markPeerVerified(actorId: string): void {
    setVerifiedPeers((current) => new Set(current).add(actorId));
    notify('Safety number marked as compared for this session.', 'success');
  }

  // B-112 diagnostics: keep the issue reporter's capability snapshot current so a
  // `:report` bundle always describes the session it came from (plain/linear mode,
  // whether the node advertises E2EE, whether this device has an enrolled vault).
  // Read lazily at submit time — never during render — because the vault answer lives
  // behind `e2eeSenderRef`, which only event handlers may touch.
  function issueReporterCapabilities(): Record<string, boolean> {
    const key = session === undefined ? undefined : `${api.target}:${session.userId}`;
    const sender =
      key !== undefined && e2eeSenderRef.current?.key === key
        ? e2eeSenderRef.current.sender
        : undefined;
    return {
      plainMode: plainEffective,
      linearMode,
      e2eeAdvertised: e2eeCapabilityState !== undefined,
      vaultEnrolled: sender?.enrolled() === true,
    };
  }

  // B-112 diagnostics: capture the last rendered frame's visible text by teeing the
  // app's own stdout stream — Ink writes every frame there, so the reporter keeps a
  // plain-text tail of whatever was last on screen (redacted again at bundle build).
  useEffect(() => {
    const capture = attachFrameCapture(stdout);
    return () => {
      capture.detach();
    };
  }, [stdout]);

  // The vault-backed send/receive pipeline for end-to-end conversations (P13-010,
  // B-101), keyed to the signed-in account. Faults are sticky until an explicit wipe
  // resets them. Enrollment (B-107) binds a messaging identity into the same factory —
  // restored from the vault at session start, or produced by the Accounts/Devices
  // flow — and `enrolled()` gates send/poll exactly as before.
  const [e2eeVaultFault, setE2eeVaultFault] = useState<E2eeVaultFault | undefined>(undefined);
  const [e2eeEnrolledDeviceId, setE2eeEnrolledDeviceId] = useState<string | undefined>(undefined);
  const e2eeSenderRef = useRef<{ key: string; sender: VaultE2eeSender } | undefined>(undefined);
  const allowInsecureCredentialFile = isTruthy(env.PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE);
  const e2eeSenderFor = useCallback(
    (activeSession: ActiveSession): VaultE2eeSender => {
      const key = `${api.target}:${activeSession.userId}`;
      const existing = e2eeSenderRef.current;
      if (existing?.key === key) return existing.sender;
      existing?.sender.close();
      const created = createVaultE2eeSender({
        account: { nodeOrigin: api.target, userId: activeSession.userId },
        allowInsecureKeyFile: allowInsecureCredentialFile,
        // B-107: once an identity exists (restored or freshly enrolled), this builds
        // its authenticated transports. Kept here — not inside e2ee-send — so the
        // vault layer stays transport-free.
        buildTransports: (identity: LocalDeviceIdentity, vault: RatchetSessionVault) =>
          createE2eeTransports({
            api,
            accessToken: ensureAccessToken,
            identity,
            pinVault: vault,
          }),
      });
      e2eeSenderRef.current = { key, sender: created };
      return created;
    },
    [api, ensureAccessToken, allowInsecureCredentialFile],
  );
  /** Actor id for enrollment material (certificates bind actor + device). */
  function actorIdFor(activeSession: ActiveSession): string {
    return activeSession.actor?.id ?? activeSession.userId;
  }
  /**
   * B-107: restores this account's previously submitted device enrollment from the
   * vault on session start, binding it (and its transports) into the runtime. A vault
   * fault here is sticky and surfaced like any other; absence just stays dormant.
   */
  useEffect(() => {
    if (session === undefined) return;
    let cancelled = false;
    const sender = e2eeSenderFor(session);
    void sender
      .restoreEnrollment()
      .then((identity) => {
        if (!cancelled && identity !== undefined) setE2eeEnrolledDeviceId(identity.deviceId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, e2eeSenderFor]);
  /**
   * B-107: the Accounts/Devices entry point's action — runs device enrollment through
   * the sender's own vault and returns what the screen should tell the viewer.
   */
  async function enrollE2eeForCurrentAccount(): Promise<{
    readonly ok: boolean;
    readonly copy: string;
    readonly peerWarning?: string | undefined;
    /** ADR 0037 §2: a published root exists this device cannot reach — the caller
     * navigates to `LinkThisDeviceScreen` instead of rendering `copy` as a dead end. */
    readonly needsAuthority?: boolean;
  }> {
    if (session === undefined) return { ok: false, copy: 'You are not signed in.' };
    const sender = e2eeSenderFor(session);
    try {
      const outcome = await sender.enroll({
        actorId: actorIdFor(session),
        transport: createEnrollmentTransport({ api, accessToken: ensureAccessToken }),
      });
      if (outcome.status === 'enrolled') {
        setE2eeEnrolledDeviceId(outcome.identity.deviceId);
        return {
          ok: true,
          copy:
            `This device is enrolled for end-to-end encrypted messages` +
            `${outcome.createdRoot ? ' and now holds this account’s messaging identity' : ''}.`,
          peerWarning: ENROLLMENT_PEER_WARNING_COPY,
        };
      }
      if (outcome.status === 'already-enrolled') {
        setE2eeEnrolledDeviceId(outcome.identity.deviceId);
        return { ok: true, copy: 'This device is already enrolled for encrypted messages.' };
      }
      if (outcome.status === 'needs-authority') {
        return { ok: false, copy: outcome.copy, needsAuthority: true };
      }
      return { ok: false, copy: outcome.copy };
    } catch (error) {
      return { ok: false, copy: describeGrpcError(error, api.target).title };
    } finally {
      // Vault faults are sticky: mirror whatever the attempt left behind.
      setE2eeVaultFault(sender.fault());
    }
  }
  /** ADR 0037 §1 step 1 — `LinkThisDeviceScreen`'s "link" choice. */
  async function beginDeviceLinkForCurrentAccount(): Promise<{
    readonly linkId: string;
    readonly sas: string;
    readonly expiresAtMs: number;
  }> {
    if (session === undefined) throw new Error('You are not signed in.');
    const sender = e2eeSenderFor(session);
    try {
      return await sender.beginLink({
        actorId: actorIdFor(session),
        transport: createEnrollmentTransport({ api, accessToken: ensureAccessToken }),
      });
    } finally {
      setE2eeVaultFault(sender.fault());
    }
  }
  /** ADR 0037 §1 step 4 — one poll of `LinkThisDeviceScreen`'s waiting state. */
  async function pollDeviceLinkForCurrentAccount(): Promise<'pending' | 'enrolled' | 'expired'> {
    if (session === undefined) return 'expired';
    const sender = e2eeSenderFor(session);
    try {
      const outcome = await sender.pollLink({
        actorId: actorIdFor(session),
        transport: createEnrollmentTransport({ api, accessToken: ensureAccessToken }),
      });
      if (outcome.deviceId !== undefined) setE2eeEnrolledDeviceId(outcome.deviceId);
      return outcome.result;
    } finally {
      setE2eeVaultFault(sender.fault());
    }
  }
  /** ADR 0037 §2 — `LinkThisDeviceScreen`'s "rotate" choice, always an unverified reset
   * here (this build has no recovery-archive import wired into the chooser yet, #272). */
  async function rotateMessagingRootForCurrentAccount(): Promise<{
    readonly generation: number;
    readonly planned: boolean;
  }> {
    if (session === undefined) throw new Error('You are not signed in.');
    const sender = e2eeSenderFor(session);
    try {
      const outcome = await sender.rotateRoot({
        actorId: actorIdFor(session),
        transport: createEnrollmentTransport({ api, accessToken: ensureAccessToken }),
      });
      if (outcome.deviceId !== undefined) setE2eeEnrolledDeviceId(outcome.deviceId);
      return outcome.result;
    } finally {
      setE2eeVaultFault(sender.fault());
    }
  }
  /** ADR 0037 §1 step 2 — DevicesScreen's "Pending link requests" section. */
  async function listPendingDeviceLinksForCurrentAccount(): Promise<
    readonly {
      readonly linkId: string;
      readonly deviceId: string;
      readonly sas: string;
      readonly expiresAtMs: number;
    }[]
  > {
    if (session === undefined) return [];
    const sender = e2eeSenderFor(session);
    return sender.listPendingLinks({
      actorId: actorIdFor(session),
      transport: createEnrollmentTransport({ api, accessToken: ensureAccessToken }),
    });
  }
  /** ADR 0037 §1 step 3 — approves a pending link after the viewer confirms the SAS. */
  async function approveDeviceLinkForCurrentAccount(linkId: string): Promise<void> {
    if (session === undefined) return;
    const sender = e2eeSenderFor(session);
    await sender.approveLink({
      actorId: actorIdFor(session),
      linkId,
      transport: createEnrollmentTransport({ api, accessToken: ensureAccessToken }),
    });
  }
  /** ADR 0037 §1 step 2: "the node showed this device different keys" — a mismatched
   * SAS is discarded, never retried silently. Cancelling needs no root key, only the
   * relay RPC, so this bypasses the vault-backed sender entirely. */
  async function discardDeviceLinkForCurrentAccount(linkId: string): Promise<void> {
    await createEnrollmentTransport({ api, accessToken: ensureAccessToken }).cancelDeviceLink(
      linkId,
    );
  }
  /** Resolves the row for the just-sent message (issue #332): a device is not in its own
   * fanout, so this stored row is the only copy the thread will ever get. */
  async function sendViaVault(
    conversationId: string,
    body: string,
  ): Promise<E2eeReceivedRow | undefined> {
    if (session === undefined) return undefined;
    const sender = e2eeSenderFor(session);
    try {
      return await sender.send(conversationId, body);
    } finally {
      setE2eeVaultFault(sender.fault());
    }
  }
  /**
   * Stable mailbox-drain callback for the open end-to-end thread (B-101). Undefined
   * until a messaging identity is enrolled, so the screen renders nothing rather than
   * polling a device this client does not have.
   */
  /**
   * Stable mailbox-drain callback for the open end-to-end thread (B-101). Resolves
   * empty until a messaging identity is enrolled (the TUI has no enrollment flow yet),
   * so the screen renders nothing extra rather than pretending to poll a device this
   * client does not have — and never touches the network on that path.
   */
  const receiveE2eeRows = useCallback(
    (conversationId: string): Promise<E2eeDrain> => {
      const sender = session === undefined ? undefined : e2eeSenderFor(session);
      if (sender === undefined || !sender.enrolled()) return Promise.resolve({ rows: [] });
      // The open thread is being read live — never count its drain toward durable unread.
      return sender.pollMailbox(conversationId, { reading: true }).then((result) => ({
        rows: result.rows,
        ...(result.controls !== undefined ? { controls: result.controls } : {}),
      }));
    },
    [session, e2eeSenderFor],
  );
  /**
   * #383: this device's durable per-conversation unread, read back from the vault.
   * Resolves `undefined` when there is no enrolled identity, which the screen treats
   * as "use the server's count as-is". Stable identity so the MessagesScreen reload
   * effect doesn't re-run on every render.
   */
  const conversationUnreadFn = useCallback(
    (conversationId: string): Promise<number | undefined> => {
      const sender = session === undefined ? undefined : e2eeSenderFor(session);
      return sender === undefined
        ? Promise.resolve(undefined)
        : sender.conversationUnread(conversationId);
    },
    [session, e2eeSenderFor],
  );
  /**
   * #383: companion durable clear for when the viewer opens/reads a thread on this
   * device. Best-effort; a vault fault never trips the mark-read path.
   */
  const clearConversationUnreadFn = useCallback(
    (conversationId: string): void => {
      const sender = session === undefined ? undefined : e2eeSenderFor(session);
      if (sender === undefined) return;
      void sender.clearConversationUnread(conversationId);
    },
    [session, e2eeSenderFor],
  );
  /** Device wipe (audit P1-2): route through the LIVE store's wipe/close, drop the
   * cached sender instance, and clear the sticky fault so the account can start over. */
  async function wipeE2eeForCurrentAccount(): Promise<void> {
    if (session === undefined) return;
    const key = `${api.target}:${session.userId}`;
    try {
      if (e2eeSenderRef.current?.key === key) {
        await e2eeSenderRef.current.sender.wipe();
      } else {
        await wipeE2eeState({ account: { nodeOrigin: api.target, userId: session.userId } });
      }
    } finally {
      if (e2eeSenderRef.current?.key === key) {
        // `sender.wipe()` already closed itself; drop the cache either way.
        e2eeSenderRef.current = undefined;
      }
      setE2eeVaultFault(undefined);
      // A wiped vault no longer holds an enrollment either (B-107).
      setE2eeEnrolledDeviceId(undefined);
    }
  }

  // A-053 (spec §197.1: "every client MUST show the new summary at next session start"):
  // best-effort, non-blocking session-start check — compare this actor's last-acknowledged
  // `privacy_notice_version` against the node's *current* one and nudge toward `:privacy`
  // when they've drifted (the node published a material change since the actor last saw it).
  // Fires once per real session start (login or a restored session), not on every render —
  // `session` only changes identity at those points. A failure here is silently ignored, same
  // as `dmRetentionDays` above; this is a hint, not a gate (nothing on `:privacy` is ever
  // gated on acknowledgement, spec §197.1).
  useEffect(() => {
    if (session === undefined) return;
    let cancelled = false;
    void Promise.all([
      ensureAccessToken().then((accessToken) => api.getPrivacyPrefs({}, accessToken)),
      api.getNodePolicy(),
    ]).then(
      ([prefsResponse, policyResponse]) => {
        if (cancelled) return;
        const acknowledgedVersion = prefsResponse.prefs?.privacyNoticeVersion ?? 0;
        const currentVersion = policyResponse.policy?.privacyNoticeVersion ?? 0;
        if (currentVersion > acknowledgedVersion) {
          setToast({
            message: 'This server’s privacy notice changed — press :privacy to review it.',
            kind: 'info',
          });
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [session, api, ensureAccessToken]);

  // Optimistic like/bookmark overlay (P4-004, spec §79), keyed by post id — applied at
  // render time (`decoratePost`) over whatever `viewerState`/`counts` a given screen's
  // own paginated list last fetched, so a like registers immediately no matter which
  // list (home/local/profile/thread/bookmarks) is currently showing that post.
  //
  // Cleared on login, logout and `R` (refresh): an overlay left over from a previous
  // session would otherwise sit on top of the server's freshly-read `viewer_state` and
  // mask it (owner feedback 2026-08-18: "posts I liked, after starting a new session,
  // showed not liked").
  const [reactionOverrides, setReactionOverrides] = useState<ReadonlyMap<string, ReactionOverride>>(
    new Map(),
  );

  // Bumped by `NotificationsScreen`'s `m` so the status-bar badge doesn't wait for
  // `useUnreadCount`'s next screen-change/60s refresh (`screenKey` below).
  const [unreadNonce, setUnreadNonce] = useState(0);
  const unreadCount = useUnreadCount(
    api,
    session !== undefined,
    ensureAccessToken,
    `${screen}:${String(unreadNonce)}`,
  );

  // Auto sign-in from a stored refresh token, and resume an unsent draft — both
  // best-effort: nothing here should block first render (spec §80/§37). `sessionManager`
  // and `store` are stable for the component's lifetime (created once via `useState`
  // initializers above), so this still only ever runs once.
  useEffect(() => {
    void sessionManager.restore().then((restored) => {
      if (restored === undefined) return;
      setSession(restored);
      // Only if the viewer hasn't already gone somewhere themselves.
      if (!navigated.current) setStack((current) => promoteRootToHome(current));
    });
    void store.load().then((loaded) => {
      if (loaded !== undefined) setDraft(loaded);
    });
  }, [sessionManager, store]);

  // Saved presentation preferences for this node+actor (P12-113). `--theme`/
  // `PATCHES_THEME` still win: `resolveTheme` is handed both, and the saved value only
  // applies when nothing higher-priority was set (P12-101's precedence).
  const sessionActorId = session?.userId;
  useEffect(() => {
    if (sessionActorId === undefined) return;
    let cancelled = false;
    void preferences.get({ nodeOrigin: api.target, actorId: sessionActorId }).then(
      (saved) => {
        if (cancelled || saved === undefined) return;
        const resolution = resolveTheme({
          envTheme: env.PATCHES_THEME ?? null,
          localTheme: saved.theme ?? null,
        });
        if (resolution.ok) {
          setThemeName(resolution.theme.name);
          setThemeSource(resolution.source);
        }
        if (saved.plainMode !== undefined && !isTruthy(env.PATCHES_PLAIN))
          setPlain(saved.plainMode);
        if (saved.quietFeed !== undefined) setQuiet(saved.quietFeed);
        if (saved.imagePolicy !== undefined) setImagePolicy(saved.imagePolicy);
        if (saved.linearMode !== undefined && !isTruthy(env.PATCHES_LINEAR))
          setLinearMode(saved.linearMode);
        if (
          saved.glyphSet !== undefined &&
          (env.PATCHES_GLYPHS === undefined || env.PATCHES_GLYPHS.trim() === '')
        )
          setGlyphSet(saved.glyphSet);
      },
      // Unreadable preferences are not an error worth a toast — the defaults are fine.
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [
    api.target,
    env.PATCHES_GLYPHS,
    env.PATCHES_LINEAR,
    env.PATCHES_PLAIN,
    env.PATCHES_THEME,
    preferences,
    sessionActorId,
  ]);

  useEffect(() => {
    if (toast === undefined) return;
    const timer = setTimeout(() => setToast(undefined), toast.kind === 'error' ? 5000 : 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message: string, kind: ToastKind = 'info'): void {
    setToast({ message, kind });
  }

  // --- layout geometry ------------------------------------------------------
  // Computed before the handlers, not in the render body, because navigation itself
  // depends on it: `Enter` on a row means "open the thread in the right pane" when
  // there is one, and "push a screen" when there is not.
  const overlayEntry = modals.top;
  const screenIsActive = overlayEntry === undefined || overlayEntry.id === 'help';
  // P12-118: linear mode never grants a drawer — both fall back to their full-screen
  // route (`toggleNotificationsDrawer`/`toggleMessagesDrawer` below), same as narrow.
  const drawersAvailableNow = !linearMode && drawerAvailable(Math.max(20, columns - 2));
  const drawerOpen = drawerRequested && drawersAvailableNow;
  // Mutually exclusive with the notifications drawer — both share the one
  // `DRAWER_COLUMNS` slice the shell subtracts from the content region below.
  const dmDrawerOpen = dmDrawerRequested && !drawerRequested && drawersAvailableNow;
  const contentRows = Math.max(3, rows - FOOTER_ROWS);
  const signedOutOnRoot = session === undefined && (screen === 'home' || screen === 'local');
  const bannerRows = signedOutOnRoot ? 1 : 0;
  const regionRows = Math.max(1, contentRows - 2 - bannerRows);
  const regionColumns = Math.max(20, columns - 2);
  // The drawer takes its columns off the region *before* split-pane arithmetic, so
  // opening one can never overflow the frame (tui-interaction-model.md §3.1).
  const anyDrawerOpen = drawerOpen || dmDrawerOpen;
  const contentColumns = Math.max(
    20,
    anyDrawerOpen ? regionColumns - DRAWER_COLUMNS : regionColumns,
  );
  // P12-118: linear mode is always a single column — never request a split.
  const layoutPlan = planResponsiveLayout(
    contentColumns,
    regionRows,
    wantsSplit(stack) && !linearMode,
  );
  const presentation = presentationFor(stack, layoutPlan.mode === 'split');
  const splitActive = presentation.mode === 'split';
  const focusedPane: 'primary' | 'secondary' =
    splitActive && paneFocusSecondary ? 'secondary' : 'primary';
  // B-046: this used to also require `focusedPane === 'primary'`, which meant a
  // list-kind screen (page/thread/profile/…) sitting in the *secondary* pane could
  // never process its own action keys even once focus moved there — `renderEntry`
  // below already multiplies this by the pane-specific `active` flag (which is
  // exactly which pane has focus), so baking primary-only focus in here a second
  // time forced every list-kind secondary screen off regardless of `Tab`.
  const listIsActive = !pendingGo && screenIsActive && !anyDrawerOpen;
  // The ribbon replaces the bottom status line at row 0 in the `full` height tier
  // (design vision §2.1, P12-102) — budget-neutral, `layout.ts#chromeSplit`.
  const showRibbon = layoutPlan.heightDensity === 'full';
  const { ribbonRows, footerRows: footerChromeRows } = chromeSplit(showRibbon);

  // --- navigation -----------------------------------------------------------

  function closeTopModal(): void {
    notify(`closed ${modals.top?.id ?? 'none'}`);
    modals.closeTop();
  }

  function clearModals(): void {
    modals.clear();
  }

  /** Drill down one level (a post's thread, an author's profile, a page). */
  function navigate(next: NavEntry): void {
    navigated.current = true;
    setLegacySubmodeActive(false);
    clearModals();
    getDiagnosticsReporter().recordBreadcrumb('nav', next.screen);
    setStack((current) => push(current, next));
  }

  /** A `g x`-style jump — see `navigation.jump`. `options.split` threads through
   * (B-042): omitted keeps today's list+detail pairing, `{ split: false }` (the plain
   * `g`/`:` path) forces a single-pane replace even when a list sits beneath the
   * destination. */
  function goTo(next: NavEntry, options?: { split?: boolean }): void {
    navigated.current = true;
    setLegacySubmodeActive(false);
    clearModals();
    getDiagnosticsReporter().recordBreadcrumb('nav', next.screen);
    setStack((current) => jump(current, next, options));
  }

  /** `Esc` (and `q` away from the root) — exactly one level, from every screen. */
  function back(): void {
    navigated.current = true;
    setLegacySubmodeActive(false);
    const next = pop(stack);
    getDiagnosticsReporter().recordBreadcrumb('nav-back', currentEntry(next).screen);
    setStack(next);
  }

  function requireSession(next: NavEntry): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    goTo(next);
  }

  function toggleHelp(): void {
    if (modals.top?.id === 'help') closeTopModal();
    else modals.push({ id: 'help', title: 'Help', render: () => null });
  }

  /** Opens `profile` on a given actor — the caller's own, or a post's author. */
  function openProfile(actorId: string, knownActor: Actor | undefined): void {
    navigate({ screen: 'profile', actorId, knownActor });
  }

  function openOwnProfile(): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    goTo({ screen: 'profile', actorId: session.userId, knownActor: session.actor });
  }

  /** `@handle` parsed out of a post body (`contextualCommands`' mention entries,
   * P12-116) — same lookup-then-navigate shape as `:profile <handle>`. */
  function openActorByHandle(handle: string): void {
    const query = handle.replace(/^@/u, '');
    void api.searchActors({ query, cursor: '', limit: 20 }).then(
      (response) => {
        const actor = response.actors.find((candidate) => candidate.handle === query);
        if (actor === undefined) notify(`No profile found for @${query}.`, 'error');
        else openProfile(actor.id, actor);
      },
      (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
    );
  }

  /** `#tag` parsed out of a post body (`contextualCommands`' tag entries, P12-116) —
   * same lookup-then-navigate shape as `:tag <name>`. */
  function openTagByName(name: string): void {
    const normalized = name.replace(/^#/u, '').toLowerCase();
    void api.searchTags({ query: normalized, cursor: '', limit: 20 }).then(
      (response) => {
        const tag = response.tags.find((candidate) => candidate.name === normalized);
        if (tag === undefined) notify(`No tag found for #${normalized}.`, 'error');
        else navigate({ screen: 'tagFeed', tag });
      },
      (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
    );
  }

  /** A link href parsed out of a post body (`contextualCommands`' link entries,
   * P12-116) — an explicit, viewer-initiated open, never an automatic fetch/preview
   * (spec §194). */
  function openLinkFromPost(url: string): void {
    if (!openLinkExternally(url, openMediaOptions)) notify('That link was blocked.', 'error');
  }

  /** `v` on a profile, or `g v` for the caller's own (P45-006) — opens that actor's
   * Patches Page. Pages are anonymous-readable (spec §170), so viewing someone
   * else's needs no session. */
  function openPage(handle: string, slug = ''): void {
    navigate({ screen: 'page', handle, slug });
  }

  /** `g v`/`:page` (own page). A plain jump never auto-splits (B-042, owner report:
   * "split-pane opens unexpectedly on navigation") — only `Ctrl+G v`'s explicit "open
   * beside" request (`allowSplit`) leaves the ordinary list+detail pairing in place. */
  function openOwnPage(options: { allowSplit?: boolean } = {}): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const handle = session.actor?.handle;
    if (handle === undefined || handle === '') {
      notify("Your profile hasn't loaded yet — try again in a moment.");
      return;
    }
    goTo(
      { screen: 'page', handle, slug: '' },
      options.allowSplit === true ? undefined : { split: false },
    );
  }

  /** `p` on a selected post row (B-017) — profile viewing needs no session. */
  function openAuthorProfile(post: Post): void {
    if (!present(post.author)) return;
    openProfile(post.author.id, post.author);
  }

  /** `Enter` on a post row — opens/drills into its thread. Each level is its own
   * stack entry, so `Esc` unwinds them one at a time. */
  function openThread(postId: string): void {
    const next: NavEntry = { screen: 'thread', postId };
    // In a split, `Enter` opens the thread *in the right pane* — the same navigation
    // call, a different presentation (§3.2). Replacing the detail rather than stacking
    // a second one keeps `Esc` exactly one press away from the list, instead of
    // unwinding every thread that was ever previewed.
    if (splitActive && currentEntry(stack).screen === 'thread') {
      navigated.current = true;
      setLegacySubmodeActive(false);
      clearModals();
      getDiagnosticsReporter().recordBreadcrumb('nav', 'thread');
      setStack((current) => replace(current, next));
      return;
    }
    navigate(next);
  }

  function updateDraft(next: ComposeDraft): void {
    setDraft(next);
    void store.save(next);
  }

  /** `r` on a post row (P4-004) — opens compose scoped to that reply target. A
   * different target than the current draft's starts a fresh draft rather than
   * continuing someone else's reply text into it. */
  function openReply(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (draft.inReplyToId !== post.id) {
      updateDraft(replyDraft(post));
    }
    goTo({ screen: 'compose' });
  }

  // --- reactions ------------------------------------------------------------

  /** Merges this post's `ReactionOverride` (if any) over its last-fetched
   * `viewerState`/`counts` — the single place every screen's rendering goes
   * through so a like/bookmark registers no matter which list is showing the
   * post (spec §79: optimistic UI). */
  function decoratePost(post: Post): Post {
    const override = reactionOverrides.get(post.id);
    if (override === undefined) return post;
    const viewerState =
      post.viewerState ??
      create(PostViewerStateSchema, { liked: false, bookmarked: false, reposted: false });
    const counts =
      post.counts ?? create(PostCountsSchema, { replies: 0, likes: 0, reposts: 0, quotes: 0 });
    return {
      ...post,
      viewerState: create(PostViewerStateSchema, {
        liked: override.liked ?? viewerState.liked,
        bookmarked: override.bookmarked ?? viewerState.bookmarked,
        reposted: override.reposted ?? viewerState.reposted,
      }),
      counts: create(PostCountsSchema, {
        ...counts,
        likes: override.likes ?? counts.likes,
        reposts: override.reposts ?? counts.reposts,
      }),
    };
  }

  function setReactionOverride(postId: string, patch: ReactionOverride): void {
    setReactionOverrides((previous) => {
      const next = new Map(previous);
      next.set(postId, { ...next.get(postId), ...patch });
      return next;
    });
  }

  /** `l` on a post row (P4-004, spec §53/§79) — optimistic, reverted on failure. */
  async function toggleLike(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const current = decoratePost(post);
    const wasLiked = current.viewerState?.liked ?? false;
    const priorLikes = current.counts?.likes ?? 0;
    setReactionOverride(post.id, {
      liked: !wasLiked,
      likes: Math.max(0, priorLikes + (wasLiked ? -1 : 1)),
    });
    try {
      const accessToken = await ensureAccessToken();
      const response = wasLiked
        ? await api.unlikePost({ postId: post.id }, accessToken)
        : await api.likePost({ postId: post.id }, accessToken);
      setReactionOverride(post.id, {
        liked: response.viewerState?.liked ?? !wasLiked,
        likes: response.counts?.likes ?? priorLikes,
      });
      notify(wasLiked ? 'Like removed.' : 'Liked.', 'success');
    } catch (error) {
      setReactionOverride(post.id, { liked: wasLiked, likes: priorLikes });
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /** `b` on a post row (P4-004, spec §53/§79) — optimistic, reverted on failure. */
  async function toggleBookmark(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const current = decoratePost(post);
    const wasBookmarked = current.viewerState?.bookmarked ?? false;
    setReactionOverride(post.id, { bookmarked: !wasBookmarked });
    try {
      const accessToken = await ensureAccessToken();
      const response = wasBookmarked
        ? await api.unbookmarkPost({ postId: post.id }, accessToken)
        : await api.bookmarkPost({ postId: post.id }, accessToken);
      setReactionOverride(post.id, {
        bookmarked: response.viewerState?.bookmarked ?? !wasBookmarked,
      });
      notify(wasBookmarked ? 'Bookmark removed.' : 'Bookmarked.', 'success');
    } catch (error) {
      setReactionOverride(post.id, { bookmarked: wasBookmarked });
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  async function toggleRepost(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const current = decoratePost(post);
    const wasReposted = current.viewerState?.reposted ?? false;
    const priorReposts = current.counts?.reposts ?? 0;
    setReactionOverride(post.id, {
      reposted: !wasReposted,
      reposts: Math.max(0, priorReposts + (wasReposted ? -1 : 1)),
    });
    try {
      const accessToken = await ensureAccessToken();
      const response = wasReposted
        ? await api.unrepostPost({ postId: post.id }, accessToken)
        : await api.repostPost({ postId: post.id }, accessToken);
      setReactionOverride(post.id, {
        reposted: response.viewerState?.reposted ?? !wasReposted,
        reposts: response.counts?.reposts ?? priorReposts,
      });
      notify(wasReposted ? 'Repost removed.' : 'Reposted.', 'success');
    } catch (error) {
      setReactionOverride(post.id, { reposted: wasReposted, reposts: priorReposts });
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  function openQuote(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    updateDraft(quoteDraft(post));
    goTo({ screen: 'compose' });
  }

  function confirmDelete(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    confirmDestructive({
      id: `delete-post:${post.id}`,
      title: 'Delete post?',
      body: 'This leaves a tombstone and cannot be undone.',
      onConfirm: () => {
        void ensureAccessToken()
          .then((accessToken) => api.deletePost({ id: post.id }, accessToken))
          .then(
            () => {
              setFeedNonce((current) => current + 1);
              notify('Post deleted.', 'success');
            },
            (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
          );
      },
    });
  }

  async function togglePin(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const pinned = session.actor?.pinnedPostIds.includes(post.id) ?? false;
    try {
      const accessToken = await ensureAccessToken();
      await (pinned
        ? api.unpinPost({ postId: post.id }, accessToken)
        : api.pinPost({ postId: post.id, position: 0 }, accessToken));
      setSession((current) => {
        if (current?.actor === undefined) return current;
        const pinnedPostIds = pinned
          ? current.actor.pinnedPostIds.filter((id) => id !== post.id)
          : [...current.actor.pinnedPostIds, post.id];
        return { ...current, actor: { ...current.actor, pinnedPostIds } };
      });
      notify(pinned ? 'Post unpinned.' : 'Post pinned.', 'success');
    } catch (error) {
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /** `f` on a post row — follow/unfollow its author without leaving the timeline.
   * Reads the current relationship first (a row carries no follow state), so this is
   * two round trips rather than the profile screen's one. */
  async function toggleFollowAuthor(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (!present(post.author)) return;
    const author = post.author;
    if (author.id === session.userId) {
      notify('That is your own post.');
      return;
    }
    try {
      const accessToken = await ensureAccessToken();
      const current = await api.getRelationship({ actorId: author.id }, accessToken);
      // §197.5: a locked author's pending request has no `follows` row yet, but
      // `unfollowActor` also deletes any outstanding `FollowRequest`, so it is the
      // same verb that cancels one.
      const shouldUnfollow =
        present(current.relationship) &&
        (current.relationship.state === FOLLOW_STATE.FOLLOWING || current.relationship.requested);
      if (shouldUnfollow) {
        await api.unfollowActor({ actorId: author.id }, accessToken);
        notify(`Unfollowed @${author.handle}.`, 'success');
      } else {
        const response = await api.followActor({ actorId: author.id }, accessToken);
        notify(
          response.requested ? 'Follow request sent.' : `Following @${author.handle}.`,
          'success',
        );
      }
    } catch (error) {
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /** `!` on a post or profile — the targeted report (spec §55). Claims the keypress
   * once it actually opens, so the shell's global issue reporter (`!` below) stands
   * down for it; signed out there is nothing to open, so the keypress falls through
   * to the global reporter, which works without a session. */
  function openReport(target: ReportTarget): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    claimTargetedBang();
    navigate({ screen: 'report', target });
  }

  function reportPost(post: Post): void {
    const handle = post.author?.handle;
    openReport({
      type: 'post',
      id: post.id,
      label: handle !== undefined && handle !== '' ? `@${handle}'s post` : 'this post',
    });
  }

  function reportActor(actor: Actor): void {
    openReport({ type: 'actor', id: actor.id, label: `@${actor.handle}` });
  }

  /** `o` on a post row (B-004/P5-003, spec §76) — downloads and opens its first
   * attachment with the OS default handler. A no-op (not an error) for a post with no
   * media. */

  /** `x` on the accounts screen (B-022) — signs out and returns to a logged-out root. */
  async function logout(): Promise<void> {
    await sessionManager.logout();
    setSession(undefined);
    setReactionOverrides(new Map());
    // B-043's background-snapshot cache is shared across mounts by design — clear it
    // here for the same reason `reactionOverrides` is cleared above: a signed-out
    // viewer, or the next account on this node, must never render a page cached under
    // the previous session.
    clearListCache();
    // A "Signed in as @alice" toast outliving the sign-out would be actively wrong.
    setToast(undefined);
    setStack(reset(rootEntry(false)));
  }

  /** `r` on the accounts screen, only offered while `emailVerified` is false (A-028) —
   * the code itself still only arrives by email and is entered via `patches verify
   * <code>`, not in-app (there is no code-entry flow here). */
  async function resendVerificationEmail(): Promise<void> {
    try {
      const accessToken = await ensureAccessToken();
      await api.resendVerification(accessToken);
      notify('Verification email sent.', 'success');
    } catch (error) {
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /**
   * A post was created. One handler for both compose presentations (P12-023): the full
   * screen pops itself off the stack on the way out, the quick-post overlay was never
   * on it. A reply lands back on the thread it answers — not on the reply's own thread,
   * which left you able to reply only to yourself (owner feedback 2026-08-18).
   */
  function onPostSubmitted(post: Post, options: { fromOverlay?: boolean } = {}): void {
    const fromOverlay = options.fromOverlay === true;
    setDraft(emptyDraft());
    void store.clear();
    notify(post.inReplyToId === '' ? 'Posted.' : 'Reply sent.', 'success');
    setFeedNonce((current) => current + 1);
    if (post.inReplyToId !== '') {
      setStack((current) =>
        jump(fromOverlay ? current : pop(current), {
          screen: 'thread',
          postId: post.inReplyToId,
        }),
      );
      return;
    }
    // A quick post never moved you off the timeline, so it must not move you now.
    if (fromOverlay || session === undefined) return;
    setStack((current) =>
      jump(pop(current), {
        screen: 'profile',
        actorId: present(post.author) ? post.author.id : session.userId,
        knownActor: present(post.author) ? post.author : session.actor,
      }),
    );
  }

  // --- preferences, theme, drawer, overlays ---------------------------------

  /** `,` — records what `Esc` restores, then opens the settings screen (P12-112). */
  function openPreferences(): void {
    revertPreferences.current = {
      theme: themeName,
      plain,
      quiet,
      imagePolicy,
      glyphSet,
      linearMode,
    };
    goTo({ screen: 'preferences' });
  }

  function savePreferences(): void {
    // Whether this save actually changes `imagePolicy` — unlike theme/plain/quiet
    // it never takes effect on the renderer already built for this session
    // (`cli.tsx` decides that once, before `App` mounts), so only tell the viewer
    // it needs a restart when it would otherwise be silent about that.
    const imagePolicyChanged = revertPreferences.current?.imagePolicy !== imagePolicy;
    revertPreferences.current = undefined;
    back();
    if (session === undefined) {
      notify('Preferences apply for this session — sign in to save them.');
      return;
    }
    void preferences
      .set(
        { nodeOrigin: api.target, actorId: session.userId },
        {
          theme: themeName,
          plainMode: plain,
          quietFeed: quiet,
          imagePolicy,
          linearMode,
          glyphSet,
        },
      )
      .then(
        () =>
          notify(
            imagePolicyChanged
              ? 'Preferences saved. Images: restart patches to apply.'
              : 'Preferences saved.',
            'success',
          ),
        // A preferences file that cannot be written must never take the app down —
        // the settings still apply for the rest of this session.
        () => notify('Preferences apply for this session — saving them failed.', 'error'),
      );
  }

  function cancelPreferences(): void {
    const previous = revertPreferences.current;
    revertPreferences.current = undefined;
    if (previous !== undefined) {
      setThemeName(previous.theme);
      setPlain(previous.plain);
      setQuiet(previous.quiet);
      setImagePolicy(previous.imagePolicy);
      setGlyphSet(previous.glyphSet);
      setLinearMode(previous.linearMode);
    }
    back();
  }

  function setThemeByName(name: string): void {
    const resolution = resolveTheme({ cliTheme: name });
    if (!resolution.ok) {
      notify(resolution.message, 'error');
      return;
    }
    setThemeName(resolution.theme.name);
    setThemeSource('command');
    notify(`Theme: ${resolution.theme.name}.`, 'success');
  }

  /** `N` — the notifications drawer. Below the wide tier there are no columns to give
   * it, so it falls back to the full screen rather than doing nothing (§3.5). */
  function toggleNotificationsDrawer(): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (linearMode || !drawerAvailable(Math.max(20, columns - 2))) {
      goTo({ screen: 'notifications' });
      return;
    }
    setDmDrawerRequested(false);
    setDrawerRequested((current) => !current);
  }

  /** `Ctrl+D` — the direct-message drawer (P12-122), the same shape and narrow/linear
   * fallback as {@link toggleNotificationsDrawer}. Its content is `MessagesScreen`
   * itself (the same full-screen `g d` would eventually mount), reused verbatim so the
   * permanent "not end-to-end encrypted" disclosure and folder/read state are never a
   * second, drifting implementation. */
  function toggleMessagesDrawer(): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (linearMode || !drawerAvailable(Math.max(20, columns - 2))) {
      goTo({ screen: 'messages' });
      return;
    }
    setDrawerRequested(false);
    setDmDrawerRequested((current) => !current);
  }

  /** `Ctrl+R` / `:reload` — retries the connection and drops both the optimistic
   * reaction overlay and the feed so every list refetches. Pulses the ribbon's
   * connection slot with a bounded spinner (P12-117's "finite refresh spinner") for
   * exactly {@link REFRESH_PULSE_MS}, cleared by its own timer regardless of how the
   * refresh itself resolves — never a second, unbounded loading indicator. */
  function manualRefresh(): void {
    retryServerInfo();
    setReactionOverrides(new Map());
    setFeedNonce((current) => current + 1);
    setRefreshing(true);
    clearTimeout(refreshPulseTimer.current);
    refreshPulseTimer.current = setTimeout(() => setRefreshing(false), REFRESH_PULSE_MS);
  }

  /** One measured `ConfirmDialog` for every destructive action (P12-008/P12-126). */
  function confirmDestructive(request: {
    id: string;
    title: string;
    body: string;
    onConfirm: () => void;
  }): void {
    modals.push({
      id: request.id,
      title: request.title,
      columns: 60,
      rows: 3,
      render: ({ closeTop }) => (
        <ConfirmDialog
          id={request.id}
          title={request.title}
          body={request.body}
          onCancel={closeTop}
          onConfirm={() => {
            closeTop();
            request.onConfirm();
          }}
        />
      ),
    });
  }

  /** `c` — the quick-post overlay. It hosts the *same* `ComposeScreen` (and therefore
   * the same editor and the same draft) as `C`, in `compact` presentation, so the two
   * can never diverge (P12-023). */
  function openQuickPost(): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    modals.push({
      id: 'quick-post',
      title: 'Quick post',
      columns: QUICK_POST_COLUMNS,
      rows: QUICK_POST_ROWS,
      // Rendered from the live tree below, not from here: this closure would capture a
      // stale `draft` and every keystroke would be lost.
      render: () => null,
    });
  }

  /** `Ctrl+F` from the quick post, and `C` directly — the full compose screen. */
  function openFullCompose(): void {
    clearModals();
    requireSession({ screen: 'compose' });
  }

  /** `o` on a post that carries media (P12-018/P12-127) — the in-app viewer, which is
   * the only place a Kitty placement is stable enough to be worth drawing. */
  function openMediaViewer(post: Post): void {
    if (post.media.length === 0) return;
    navigate({
      screen: 'media',
      postId: post.id,
      attachments: post.media,
      initialIndex: 0,
    });
  }

  /** `o` from inside the viewer — hands the attachment to the OS handler (spec §76). */
  function openAttachmentExternally(attachment: MediaAttachment): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    openMediaExternally(api, cache, attachment, ensureAccessToken, {
      env,
      ...openMediaOptions,
    }).catch((error: unknown) => {
      notify(describeGrpcError(error, api.target).title, 'error');
    });
  }

  /** `E` on one of your own posts (P12-125) — compose in edit mode, seeded with the
   * body as it stands. A separate draft from the compose draft would be a second place
   * unsent text can hide, so the shared draft is reused and restored on the way out. */
  function openPostEdit(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (!present(post.author) || post.author.id !== session.userId) {
      notify('You can only edit your own posts.', 'error');
      return;
    }
    updateDraft({
      body: post.body,
      clientRequestId: randomUUID(),
      ...(post.contentWarning === '' ? {} : { contentWarning: post.contentWarning }),
    });
    navigate({ screen: 'postEdit', postId: post.id, body: post.body });
  }

  const rowActions: PostRowActions = {
    onOpenPost: (post) => openThread(post.id),
    onOpenAuthor: openAuthorProfile,
    onReply: openReply,
    onToggleLike: (post) => void toggleLike(post),
    onToggleBookmark: (post) => void toggleBookmark(post),
    onToggleFollow: (post) => void toggleFollowAuthor(post),
    onToggleRepost: (post) => void toggleRepost(post),
    onQuote: openQuote,
    onEdit: openPostEdit,
    onDelete: confirmDelete,
    onHistory: (post) => goTo({ screen: 'postHistory', postId: post.id }),
    onTogglePin: (post) => void togglePin(post),
    onReport: reportPost,
    onOpenMedia: openMediaViewer,
    decorate: decoratePost,
    jump: listJump,
  };

  // The command palette's contextual half (P12-116): `rowActions` plus the
  // mention/tag/link lookups, ready for whichever post is under the cursor. `post`
  // itself stays `undefined` here — no list screen yet reports its own `VirtualList`
  // selection up to the shell (that plumbing is the rest of P12-116, not this task) —
  // so `contextualCommands()` below is a harmless no-op today and starts producing
  // real entries the moment a screen fills `post` in.
  const contextualSelection: ContextualSelection = {
    actions: rowActions,
    viewerActorId: session?.userId,
    onOpenActor: (handle: string) => openActorByHandle(handle),
    onOpenTag: (name: string) => openTagByName(name),
    onOpenLink: (url: string) => openLinkFromPost(url),
  };
  // False positive below: `contextualCommands` never invokes `onOpenActor`/`onOpenTag`/
  // `onOpenLink` itself, only `bind()`s them into closures `CommandPalette` calls later
  // from `onInvoke` (an event handler) — the static check can't see that
  // `openActorByHandle` (which touches `navigated.current` via `navigate()`) is reached
  // only once a viewer actually picks a mention command, never synchronously here.
  // eslint-disable-next-line react-hooks/refs
  const contextualPaletteCommands = contextualCommands(contextualSelection);

  function setToggle(
    value: string | undefined,
    current: boolean,
    update: (next: boolean) => void,
    label: string,
  ): void {
    if (value !== undefined && !['on', 'off', 'toggle'].includes(value)) {
      notify(`${label} expects on, off, or toggle.`, 'error');
      return;
    }
    const next = value === 'on' ? true : value === 'off' ? false : !current;
    update(next);
    notify(`${label} ${next ? 'on' : 'off'}.`, 'success');
  }

  function forceQuit(): void {
    const hasDraft = draft.body !== '' || (draft.attachments?.length ?? 0) > 0;
    if (!hasDraft) {
      exit();
      return;
    }
    confirmDestructive({
      id: 'discard-draft',
      title: 'Discard draft and quit?',
      body: 'Your current post draft will be discarded.',
      onConfirm: exit,
    });
  }

  function safeQuit(): void {
    if (canGoBack(stack)) back();
    else exit();
  }

  function executeBinding(
    binding: Binding,
    command: string | undefined,
    args: readonly string[],
  ): void {
    const name = command ?? binding.commands?.[0]?.name;
    switch (name) {
      case 'q':
      case 'quit':
      case 'back':
        safeQuit();
        return;
      case 'q!':
        forceQuit();
        return;
      case 'home':
        requireSession({ screen: 'home' });
        return;
      case 'local':
        goTo({ screen: 'local' });
        return;
      case 'profile': {
        const target = args[0];
        if (target === undefined) {
          openOwnProfile();
          return;
        }
        const query = target.replace(/^@/u, '');
        void api.searchActors({ query, cursor: '', limit: 20 }).then(
          (response) => {
            const actor = response.actors.find((candidate) => candidate.handle === query);
            if (actor === undefined) notify(`No profile found for @${query}.`, 'error');
            else openProfile(actor.id, actor);
          },
          (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
        );
        return;
      }
      case 'page': {
        const target = args[0];
        if (target === undefined) {
          openOwnPage();
          return;
        }
        const [handle = '', slug = ''] = target.replace(/^@/u, '').split('/', 2);
        if (handle === '') notify('Page expects @handle[/slug].', 'error');
        else openPage(handle, slug);
        return;
      }
      case 'search':
        goTo({ screen: 'search' });
        if (args.length > 0) notify(`Search opened for “${args.join(' ')}”.`);
        return;
      case 'notifications':
        requireSession({ screen: 'notifications' });
        return;
      case 'bookmarks':
        requireSession({ screen: 'bookmarks' });
        return;
      case 'help':
        toggleHelp();
        return;
      case 'reload':
        manualRefresh();
        notify('Reloaded (Ctrl+R).', 'success');
        return;
      case 'plain':
        setToggle(args[0], plain, setPlain, 'Plain mode');
        return;
      case 'quiet':
        setToggle(args[0], quiet, setQuiet, 'Quiet feed');
        return;
      case 'linear':
        setToggle(args[0], linearMode, setLinearMode, 'Linear mode');
        return;
      case 'w':
      case 'post':
      case 'wq':
        notify(`:${name} is only available from an editor that supports shell commands.`, 'error');
        return;
      case 'preferences':
        openPreferences();
        return;
      case 'theme': {
        const name = args[0];
        if (name === undefined) openPreferences();
        else setThemeByName(name);
        return;
      }
      case 'compose':
        openFullCompose();
        return;
      case 'privacy':
        requireSession({ screen: 'privacy' });
        return;
      case 'report':
        // B-112: the beta issue reporter — deliberately reachable signed out.
        goTo({ screen: 'issueReport' });
        return;
      case 'followers':
        if (session?.actor) {
          goTo({ screen: 'followers', actorId: session.userId, handle: session.actor.handle });
        } else {
          notify('Sign in to view your followers.', 'error');
        }
        return;
      case 'following':
        if (session?.actor) {
          goTo({ screen: 'following', actorId: session.userId, handle: session.actor.handle });
        } else {
          notify('Sign in to view people you follow.', 'error');
        }
        return;
      case 'followrequests':
        requireSession({ screen: 'followRequests' });
        return;
      case 'filters':
      case 'filter':
        requireSession({ screen: 'filters' });
        return;
      case 'lists':
        requireSession({ screen: 'filterLists' });
        return;
      case 'labelers':
        requireSession({ screen: 'labelers' });
        return;
      case 'appeals':
        requireSession({ screen: 'appeals' });
        return;
      case 'modlog':
        goTo({ screen: 'moderationLog' });
        return;
      case 'tag': {
        const query = args[0];
        if (query === undefined) {
          notify('tag expects a name, e.g. :tag synths.', 'error');
          return;
        }
        const normalized = query.replace(/^#/u, '').toLowerCase();
        void api.searchTags({ query: normalized, cursor: '', limit: 20 }).then(
          (response) => {
            const tag = response.tags.find((candidate) => candidate.name === normalized);
            if (tag === undefined) notify(`No tag found for #${normalized}.`, 'error');
            else navigate({ screen: 'tagFeed', tag });
          },
          (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
        );
        return;
      }
      case 'messages':
        requireSession({ screen: 'messages' });
        return;
      case 'communities':
        notify(
          `:${name} is registered but its screen is not connected to this shell yet.`,
          'error',
        );
        return;
    }

    switch (binding.keys) {
      case 'g h':
        requireSession({ screen: 'home' });
        return;
      case 'g l':
        goTo({ screen: 'local' });
        return;
      case 'g p':
        openOwnProfile();
        return;
      case 'g b':
        requireSession({ screen: 'bookmarks' });
        return;
      case 'g n':
        requireSession({ screen: 'notifications' });
        return;
      case 'g v':
        openOwnPage();
        return;
      case '/':
        goTo({ screen: 'search' });
        return;
      case 'c':
        openQuickPost();
        return;
      case 'C':
        openFullCompose();
        return;
      case 'N':
        toggleNotificationsDrawer();
        return;
      case ',':
        openPreferences();
        return;
      case '~':
        setQuiet((current) => !current);
        return;
      case 'P':
        setPlain((current) => !current);
        return;
      case '?':
        toggleHelp();
        return;
      case 'Esc':
        back();
        return;
      case 'q':
        safeQuit();
        return;
      case 'Ctrl+R':
        manualRefresh();
        return;
      case 'Ctrl+D':
        toggleMessagesDrawer();
        return;
      default:
        notify(`${binding.keys} — ${binding.description ?? binding.hint}`);
    }
  }

  function invokePalette(invocation: PaletteInvocation): void {
    executeBinding(
      invocation.binding,
      invocation.source === 'command' ? invocation.alias.name : undefined,
      invocation.args,
    );
  }

  function openCommandPalette(): void {
    modals.push({
      id: 'command-palette',
      title: 'Commands',
      render: ({ closeTop }) => (
        <CommandPalette
          screen={screen}
          authenticated={session !== undefined}
          history={commandHistory}
          contextualCommands={contextualPaletteCommands}
          onInvoke={invokePalette}
          onError={(message) => notify(message, 'error')}
          onClose={closeTop}
        />
      ),
    });
  }

  // --- the shell input dispatcher ------------------------------------------
  // Registered modal/sub-mode/screen layers run top-down. Legacy text screens
  // are represented by a compatibility layer until they adopt `useKeyLayer`;
  // this consumes printable keys without disabling Ctrl+C or Ctrl+P.
  function handleShellInput(input: string, key: Key): void {
    // Keys typed fast enough to land in one stdin read reach Ink as a single
    // multi-character keypress; replay them one at a time so `g h` works at speed.
    if (isCoalescedKeyRun(input, key)) {
      for (const split of splitCoalescedKeyRun(input, key))
        handleShellInput(split.input, split.key);
      return;
    }
    if (isCtrlKey(input, key, 'c')) {
      exit();
      return;
    }
    if (inputLayers.dispatch(input, key)) return;
    if (modals.top !== undefined && key.escape) {
      closeTopModal();
      return;
    }
    const legacyTextScreen =
      ['login', 'compose', 'postEdit', 'search', 'report', 'editProfile', 'issueReport'].includes(
        screen,
      ) ||
      // The quick-post overlay hosts the same legacy text screen; without this the
      // shell would treat every character typed into it as a global key.
      modals.top?.id === 'quick-post';
    if (key.escape && legacySubmodeActiveRef.current) {
      legacySubmodeActiveRef.current = false;
      setLegacySubmodeState(false);
      return;
    }
    if (legacyInputConsumes(input, key, legacyTextScreen || legacySubmodeActiveRef.current)) {
      return;
    }
    if (isPaletteShortcut(input, key)) {
      openCommandPalette();
      return;
    }
    if (pendingGoRef.current) {
      setPendingGo(false);
      const allowSplit = pendingGoAllowSplitRef.current;
      pendingGoAllowSplitRef.current = false;
      if (input === 'p') openOwnProfile();
      else if (input === 'l') goTo({ screen: 'local' });
      else if (input === 'h') requireSession({ screen: 'home' });
      else if (input === 's') goTo({ screen: 'search' });
      else if (input === 'b') requireSession({ screen: 'bookmarks' });
      else if (input === 'n') requireSession({ screen: 'notifications' });
      else if (input === 'v') openOwnPage({ allowSplit });
      else if (input === 'e') requireSession({ screen: 'editProfile' });
      else if (input === 'd') requireSession({ screen: 'messages' });
      else if (input === 'c') {
        notify(`g ${input} is registered but its screen is not connected yet.`, 'error');
      } else if (input === 'g') {
        setListJump((current) => ({ edge: 'top', nonce: (current?.nonce ?? 0) + 1 }));
      }
      return;
    }
    // `Ctrl+W h` / `Ctrl+W l` — B-048's directional alias to `Tab`: `h` focuses the
    // primary pane, `l` the secondary, matching the owner's tmux/vim muscle memory.
    // A no-op (still consumes the key) when the screen isn't split, same as `Tab`
    // above.
    if (pendingPaneRef.current) {
      pendingPaneRef.current = false;
      if (splitActive) {
        if (input === 'h') setPaneFocusSecondary(false);
        else if (input === 'l') setPaneFocusSecondary(true);
      }
      return;
    }
    if (key.tab && splitActive) {
      setPaneFocusSecondary((current) => !current);
      return;
    }
    if (key.escape) {
      // A drawer is presentation, not history: `Esc` closes it before it starts
      // popping the navigation stack. The DM drawer is the one drawer whose content
      // owns internal sub-views (a thread inside the conversation list) — while it is
      // signed in and mounted, it consumes its own `Esc` and closes itself via
      // `onBack` only once it has nothing left to back out of, so this blanket
      // handler stands down rather than racing it closed mid-thread. Signed out, the
      // drawer renders nothing to consume the key, so this is the only path left.
      if (drawerRequested) setDrawerRequested(false);
      else if (dmDrawerRequested && session === undefined) setDmDrawerRequested(false);
      else if (dmDrawerRequested) {
        /* MessagesScreen's own `onBack` closes it (see the drawer's JSX above). */
      } else back();
      return;
    }
    if (input === 'q') {
      safeQuit();
      return;
    }
    // B-112: `!` — the beta issue reporter from anywhere: errors, janky flows and
    // feature ideas, not just hard failures. Legacy text-entry screens never get
    // here (they consumed the key above), and a targeted post/profile report that
    // actually opened claimed this keypress first (`claimTargetedBang`). `:report`
    // reaches the same screen by name from the command palette.
    if (input === '!' && !targetedBangClaimedRef.current) {
      goTo({ screen: 'issueReport' });
      return;
    }
    if (input === '?') {
      toggleHelp();
      return;
    }
    if (isCtrlKey(input, key, 'r')) {
      manualRefresh();
      return;
    }
    if (isCtrlKey(input, key, 'd')) {
      toggleMessagesDrawer();
      return;
    }
    // `Ctrl+G` — the same `g <key>` prefix, but B-042's explicit "open beside"
    // request: a detail destination that would normally replace the screen
    // (`openOwnPage`) keeps its ordinary split pairing instead. Bare `g` below always
    // clears this flag first, so it never leaks into a later plain jump.
    if (isCtrlKey(input, key, 'g')) {
      pendingGoAllowSplitRef.current = true;
      setPendingGo(true);
      clearTimeout(pendingGoTimer.current);
      pendingGoTimer.current = setTimeout(() => setPendingGo(false), 600);
      return;
    }
    // `Ctrl+W` — opens the two-key `h`/`l` pane-focus prefix above. `Tab` stays the
    // fast toggle for the common two-pane case; this is the directional alias that
    // stays correct if a third pane ever exists. Guarded off legacy text-entry
    // screens (`ComposeScreen`'s `TextEditor` binds its own `Ctrl+W` to kill-word-back,
    // line 105 of `components/input/TextEditor.tsx`) — Ink has no stop-propagation, so
    // both listeners would otherwise see the same keypress, and this prefix would eat
    // the very next character typed after a word-delete.
    if (isCtrlKey(input, key, 'w') && !legacyTextScreen && !legacySubmodeActiveRef.current) {
      pendingPaneRef.current = true;
      clearTimeout(pendingPaneTimer.current);
      pendingPaneTimer.current = setTimeout(() => {
        pendingPaneRef.current = false;
      }, 600);
      return;
    }
    if (input === 'L') {
      goTo({ screen: session === undefined ? 'login' : 'accounts' });
      return;
    }
    if (input === 'P') {
      setPlain((current) => !current);
      return;
    }
    if (input === 'c') {
      openQuickPost();
      return;
    }
    if (input === 'C') {
      openFullCompose();
      return;
    }
    if (input === 'N') {
      toggleNotificationsDrawer();
      return;
    }
    if (input === ',') {
      openPreferences();
      return;
    }
    if (input === '~') {
      setQuiet((current) => !current);
      return;
    }
    if (input === '/') {
      goTo({ screen: 'search' });
      return;
    }
    if (input === 'g') {
      pendingGoAllowSplitRef.current = false;
      setPendingGo(true);
      clearTimeout(pendingGoTimer.current);
      pendingGoTimer.current = setTimeout(() => setPendingGo(false), 600);
    }
  }
  useInput(handleShellInput, { isActive: isRawModeSupported });

  // Checked after the hooks, never before — hook order must not depend on size.
  if (columns < MIN_TERMINAL_SIZE.columns || rows < MIN_TERMINAL_SIZE.rows) {
    return <TerminalTooSmall columns={columns} rows={rows} />;
  }

  /**
   * One screen, given its route payload. Extracted from the render body because a
   * split renders *two* of them from the same stack (§3.2) — the nearest list beneath
   * on the left, the detail on top on the right — and neither may be a second,
   * drifting copy of the other's wiring.
   */
  function renderEntry(target: NavEntry, active: boolean): ReactNode {
    const listActive = active && listIsActive;
    switch (target.screen) {
      case 'help':
        return (
          <HelpScreen
            target={api.target}
            serverInfo={serverInfoState}
            contextScreen={stack[stack.length - 2]?.screen ?? 'local'}
            isActive={active}
            onClose={back}
          />
        );
      case 'postHistory':
        return (
          <PostHistoryScreen
            api={api}
            postId={target.postId}
            isActive={active}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
          />
        );
      case 'media':
        return (
          <MediaViewerScreen
            attachments={target.attachments}
            initialIndex={target.initialIndex}
            isActive={active}
            onOpenExternal={openAttachmentExternally}
            onCancel={back}
          />
        );
      case 'preferences':
        return (
          <PreferencesScreen
            isActive={active}
            themeName={themeName}
            themeSource={themeSource}
            onPreviewTheme={setThemeName}
            plain={plain}
            onPlainChange={setPlain}
            quiet={quiet}
            onQuietChange={setQuiet}
            linear={linearMode}
            onLinearChange={setLinearMode}
            glyphSet={glyphSet}
            onGlyphSetChange={setGlyphSet}
            imagePolicy={imagePolicy}
            onImagePolicyChange={setImagePolicy}
            onSave={savePreferences}
            onCancel={cancelPreferences}
            canPersist={session !== undefined}
            onOpenPrivacy={() => requireSession({ screen: 'privacy' })}
            onOpenFilters={() => requireSession({ screen: 'filters' })}
            onOpenFilterLists={() => requireSession({ screen: 'filterLists' })}
            onOpenLabelers={() => requireSession({ screen: 'labelers' })}
          />
        );
      case 'privacy':
        return session === undefined ? null : (
          <PrivacyScreen
            api={api}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onConfirm={confirmDestructive}
            onBack={back}
          />
        );
      case 'followRequests':
        return session === undefined ? null : (
          <FollowRequestsScreen
            api={api}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onBack={back}
          />
        );
      case 'devices':
        return session === undefined ? null : (
          <DevicesScreen
            api={api}
            session={session}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onWipeE2ee={() => wipeE2eeForCurrentAccount()}
            thisDeviceId={e2eeEnrolledDeviceId}
            e2eeCapabilityState={e2eeCapabilityState}
            onEnrollE2ee={() => enrollE2eeForCurrentAccount()}
            onNeedsAuthority={() => navigate({ screen: 'linkThisDevice' })}
            onListPendingLinks={() => listPendingDeviceLinksForCurrentAccount()}
            onApproveLink={(linkId) => approveDeviceLinkForCurrentAccount(linkId)}
            onDiscardLink={(linkId) => discardDeviceLinkForCurrentAccount(linkId)}
            onBack={back}
          />
        );
      case 'linkThisDevice':
        return session === undefined ? null : (
          <LinkThisDeviceScreen
            isActive={active}
            onBeginLink={() => beginDeviceLinkForCurrentAccount()}
            onPollLink={() => pollDeviceLinkForCurrentAccount()}
            onRotateRoot={() => rotateMessagingRootForCurrentAccount()}
            onDone={() => back()}
            onBack={back}
          />
        );
      case 'safetyNumber':
        return session === undefined ? null : (
          <SafetyNumberScreen
            api={api}
            session={session}
            isActive={active}
            targetActorId={target.targetActorId}
            ensureAccessToken={ensureAccessToken}
            verified={verifiedPeers.has(target.targetActorId)}
            onMarkVerified={() => markPeerVerified(target.targetActorId)}
            onBack={back}
          />
        );
      case 'filters':
        return session === undefined ? null : (
          <FiltersScreen
            api={api}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onConfirm={confirmDestructive}
            onBack={back}
          />
        );
      case 'filterLists':
        return session === undefined ? null : (
          <FilterListsScreen
            api={api}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onBack={back}
          />
        );
      case 'labelers':
        return session === undefined ? null : (
          <LabelersScreen
            api={api}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onBack={back}
          />
        );
      case 'appeals':
        return session === undefined ? null : (
          <AppealsScreen
            api={api}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onBack={back}
          />
        );
      case 'moderationLog':
        return <ModerationLogScreen api={api} isActive={active} onBack={back} />;
      case 'local':
        return (
          <LocalScreen
            api={api}
            isActive={listActive}
            actions={rowActions}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
            refreshKey={feedNonce}
          />
        );
      case 'home':
        return session === undefined ? (
          <Text color={theme.muted}>Log in (L) to see the people you follow.</Text>
        ) : (
          <HomeScreen
            api={api}
            isActive={listActive}
            ensureAccessToken={ensureAccessToken}
            actions={rowActions}
            refreshKey={feedNonce}
            savedViews={{
              store: savedViews,
              key: { nodeOrigin: api.target, actorId: session.userId },
            }}
          />
        );
      case 'search':
        return (
          <SearchScreen
            api={api}
            isActive={active}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
            onOpenActor={(actor) => openProfile(actor.id, actor)}
            onOpenTag={(tag) => navigate({ screen: 'tagFeed', tag })}
            actions={rowActions}
            onCancel={back}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            api={api}
            actorId={target.actorId}
            knownActor={target.knownActor}
            isActive={listActive}
            actions={rowActions}
            viewerActorId={session?.userId}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
            onReportActor={reportActor}
            onVisitPage={(actor) => openPage(actor.handle)}
            onConfirm={confirmDestructive}
            onEditProfile={
              session === undefined ? undefined : () => navigate({ screen: 'editProfile' })
            }
            onViewFollowers={(actor) =>
              navigate({ screen: 'followers', actorId: actor.id, handle: actor.handle })
            }
            onViewFollowing={(actor) =>
              navigate({ screen: 'following', actorId: actor.id, handle: actor.handle })
            }
            refreshKey={feedNonce}
            onNotify={notify}
          />
        );
      case 'followers':
        return (
          <ActorListScreen
            api={api}
            title={`@${target.handle}'s followers`}
            fetchPage={async (cursor) => {
              const res = await api.listFollowers({ actorId: target.actorId, cursor, limit: 30 });
              return { items: res.actors, page: res.page };
            }}
            isActive={listActive}
            onBack={back}
            onOpenProfile={(actor) =>
              navigate({ screen: 'profile', actorId: actor.id, knownActor: actor })
            }
          />
        );
      case 'following':
        return (
          <ActorListScreen
            api={api}
            title={`@${target.handle}'s following`}
            fetchPage={async (cursor) => {
              const res = await api.listFollowing({ actorId: target.actorId, cursor, limit: 30 });
              return { items: res.actors, page: res.page };
            }}
            isActive={listActive}
            onBack={back}
            onOpenProfile={(actor) =>
              navigate({ screen: 'profile', actorId: actor.id, knownActor: actor })
            }
          />
        );
      case 'editProfile':
        return session?.actor === undefined ? null : (
          <EditProfileScreen
            api={api}
            actor={session.actor}
            ensureAccessToken={ensureAccessToken}
            isActive={active}
            onCancel={back}
            onSaved={(actor) => {
              setSession((current) => (current === undefined ? current : { ...current, actor }));
              notify('Profile saved.', 'success');
              back();
            }}
          />
        );
      case 'page':
        return (
          <PageScreen
            api={api}
            handle={target.handle}
            initialSlug={target.slug}
            viewerActorId={session?.userId}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
            isActive={listActive}
            isOwnPage={session?.actor?.handle === target.handle}
            onCapturingInput={setLegacySubmodeActive}
            env={env}
            draftStore={pageDraftStore}
            editorOptions={pageEditorOptions}
          />
        );
      case 'thread':
        return (
          <ThreadScreen
            api={api}
            postId={target.postId}
            isActive={listActive}
            actions={rowActions}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
            refreshKey={feedNonce}
            glyphSet={glyphSet}
          />
        );
      case 'tagFeed':
        return (
          <TagFeedScreen
            api={api}
            initialTag={target.tag}
            isActive={active}
            actions={rowActions}
            ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
            onCancel={back}
          />
        );
      case 'messages':
        return session === undefined ? null : (
          <MessagesScreen
            api={messagesApi}
            isActive={active}
            initialConversationId={target.conversationId}
            viewerActorId={session.userId}
            dmRetentionDays={dmRetentionDays}
            glyphSet={glyphSet}
            verifiedPeers={verifiedPeers}
            e2eeCapabilityState={e2eeCapabilityState}
            sendE2ee={sendViaVault}
            conversationUnread={conversationUnreadFn}
            clearConversationUnread={clearConversationUnreadFn}
            receiveE2ee={receiveE2eeRows}
            e2eeVaultFault={e2eeVaultFault}
            onBack={back}
            onOpenSafetyNumber={(actorId) =>
              setStack((s) => push(s, { screen: 'safetyNumber', targetActorId: actorId }))
            }
            onReadStateChanged={() => setUnreadNonce((current) => current + 1)}
            refreshToken={feedNonce}
          />
        );
      case 'bookmarks':
        return session === undefined ? null : (
          <BookmarksScreen
            api={api}
            isActive={listActive}
            ensureAccessToken={ensureAccessToken}
            actions={rowActions}
            refreshKey={feedNonce}
          />
        );
      case 'notifications':
        return session === undefined ? null : (
          <NotificationsScreen
            api={api}
            isActive={listActive}
            ensureAccessToken={ensureAccessToken}
            onOpenPost={openThread}
            onOpenConversation={(conversationId) =>
              setStack((s) => push(s, { screen: 'messages', conversationId }))
            }
            onOpenAuthor={(actor) => openProfile(actor.id, actor)}
            onReadStateChanged={() => setUnreadNonce((current) => current + 1)}
          />
        );
      case 'report':
        return session === undefined ? null : (
          <ReportScreen
            api={api}
            target={target.target}
            ensureAccessToken={ensureAccessToken}
            isActive={active}
            onConfirm={confirmDestructive}
            onCancel={back}
            onSubmitted={() => {
              notify('Report submitted — thank you.', 'success');
              back();
            }}
          />
        );
      case 'accounts':
        return session === undefined ? null : (
          <AccountsScreen
            api={api}
            env={env}
            session={session}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            e2eeCapabilityState={e2eeCapabilityState}
            e2eeEnrolledDeviceId={e2eeEnrolledDeviceId}
            onOpenDevices={() => navigate({ screen: 'devices' })}
            onEnrollE2ee={() => enrollE2eeForCurrentAccount()}
            onNeedsAuthority={() => navigate({ screen: 'linkThisDevice' })}
            onLogout={() => void logout()}
            onResendVerification={() => void resendVerificationEmail()}
            onBack={back}
          />
        );
      case 'issueReport':
        return (
          <IssueReportScreen
            env={env}
            nodeDomain={api.target}
            sessionHandle={session?.actor?.handle}
            capabilities={issueReporterCapabilities}
            isActive={active}
            onCancel={back}
            onNotify={notify}
          />
        );
      case 'login':
        return (
          <LoginScreen
            api={api}
            sessionManager={sessionManager}
            env={env}
            isActive={active}
            onCancel={back}
            onSuccess={(newSession) => {
              setSession(newSession);
              // A stale overlay from before signing in would mask the server's real
              // viewer state for this account.
              setReactionOverrides(new Map());
              notify(`Signed in as @${newSession.actor?.handle ?? '…'}.`, 'success');
              setStack((current) => promoteRootToHome(pop(current)));
            }}
          />
        );
      case 'compose':
        return session === undefined ? null : (
          <ComposeScreen
            api={api}
            viewerActorId={session.userId}
            draft={draft}
            onChange={updateDraft}
            onCancel={back}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onNotify={notify}
            onSubmitted={onPostSubmitted}
          />
        );
      case 'postEdit':
        return session === undefined ? null : (
          <ComposeScreen
            api={api}
            viewerActorId={session.userId}
            mode="edit"
            postId={target.postId}
            draft={draft}
            onChange={updateDraft}
            onCancel={back}
            isActive={active}
            ensureAccessToken={ensureAccessToken}
            onNotify={notify}
            onSubmitted={(post) => {
              setDraft(emptyDraft());
              void store.clear();
              notify('Post updated.', 'success');
              setFeedNonce((current) => current + 1);
              setStack((current) => pop(current));
              void post;
            }}
          />
        );
      default:
        return null;
    }
  }

  const paneRows = Math.max(1, regionRows - 1);
  const screenRegion =
    presentation.mode === 'split' ? (
      <SplitPane
        width={contentColumns}
        height={regionRows}
        requestedSplit
        focusedPane={focusedPane}
        primaryTitle={SCREEN_TITLES[presentation.primary.screen]}
        secondaryTitle={SCREEN_TITLES[presentation.secondary.screen]}
        primary={
          <ContentSizeProvider size={{ rows: paneRows, columns: layoutPlan.leftWidth }}>
            {renderEntry(presentation.primary, focusedPane === 'primary' && screenIsActive)}
          </ContentSizeProvider>
        }
        secondary={
          <ContentSizeProvider size={{ rows: paneRows, columns: layoutPlan.rightWidth }}>
            {renderEntry(presentation.secondary, focusedPane === 'secondary' && screenIsActive)}
          </ContentSizeProvider>
        }
      />
    ) : (
      <ContentSizeProvider size={{ rows: regionRows, columns: contentColumns }}>
        {renderEntry(presentation.primary, screenIsActive)}
      </ContentSizeProvider>
    );

  // `command-palette`, `help` and `quick-post` are rendered from here rather than from
  // their `ModalEntry.render` closure: those closures are captured when the modal is
  // pushed, so they would see a stale draft/screen and every keystroke would be lost.
  const overlayNode: ReactNode =
    overlayEntry === undefined ? null : overlayEntry.id === 'command-palette' ? (
      <CommandPalette
        screen={screen}
        authenticated={session !== undefined}
        history={commandHistory}
        contextualCommands={contextualPaletteCommands}
        onInvoke={invokePalette}
        onError={(message) => notify(message, 'error')}
        onClose={closeTopModal}
      />
    ) : overlayEntry.id === 'help' ? (
      <HelpScreen
        target={api.target}
        serverInfo={serverInfoState}
        contextScreen={screen}
        isActive
        onClose={closeTopModal}
      />
    ) : overlayEntry.id === 'quick-post' && session !== undefined ? (
      <ComposeScreen
        api={api}
        viewerActorId={session.userId}
        compact
        rows={Math.min(QUICK_POST_ROWS, regionRows)}
        columns={Math.min(QUICK_POST_COLUMNS, Math.max(20, contentColumns - 8))}
        draft={draft}
        onChange={updateDraft}
        onCancel={closeTopModal}
        onExpand={openFullCompose}
        onNotify={notify}
        isActive
        ensureAccessToken={ensureAccessToken}
        onSubmitted={(post) => {
          clearModals();
          onPostSubmitted(post, { fromOverlay: true });
        }}
      />
    ) : (
      overlayEntry.render({ closeTop: closeTopModal, clear: clearModals })
    );

  const overlayColumns =
    overlayEntry?.id === 'command-palette'
      ? PALETTE_COLUMNS
      : (overlayEntry?.columns ?? QUICK_POST_COLUMNS);
  const overlayRows =
    overlayEntry?.id === 'command-palette' ? PALETTE_ROWS : (overlayEntry?.rows ?? QUICK_POST_ROWS);
  // Under 80 columns or under 28 rows a centred box has nowhere to sit, so the overlay
  // takes the region over instead (§3.1). Help is a reference screen: always a takeover.
  // P12-118: linear mode never centres a floating overlay — always the full-screen
  // takeover, same fallback narrow/compact already use.
  const overlayTakeover =
    linearMode ||
    layoutPlan.widthTier === 'narrow' ||
    layoutPlan.heightDensity === 'compact' ||
    overlayEntry?.id === 'help' ||
    overlayEntry?.presentation === 'takeover';

  // The ribbon/status-bar breadcrumb (P12-102, design vision §2.1/§2.3: "focus is
  // visible in the ribbon"). A split pane already names both sides — `patches › Home ›
  // Thread` — so this is P12-108's split-pane breadcrumb too, not a second mechanism.
  // Narrowest tier keeps only the last segment; `breadcrumbSegmentLimit` grows from there.
  const breadcrumbSegments = [
    'patches',
    ...(splitActive
      ? [SCREEN_TITLES[presentation.primary.screen], SCREEN_TITLES[presentation.secondary.screen]]
      : [SCREEN_TITLES[screen]]),
    ...(drawerOpen ? ['Notifications'] : []),
    ...(dmDrawerOpen ? ['Messages'] : []),
  ];
  const breadcrumb = breadcrumbSegments.slice(-breadcrumbSegmentLimit(layoutPlan.widthTier));

  return (
    <MediaSessionProvider session={mediaSession}>
      {/* The one `Date.now()` interval for every relative timestamp in the app
          (P12-025/P12-117) — mounted once, here, so every consumer reads `useNow()`
          instead of starting its own per-row timer. */}
      <NowProvider>
        <LinearModeProvider linear={linearMode}>
          <PlainModeProvider plain={plainEffective}>
            <ActiveThemeProvider theme={activeTheme}>
              <ModalStackProvider controller={modals}>
                <KeyLayerProvider stack={inputLayers}>
                  {/* An open overlay releases every live Kitty placement first: slicing a
                  unicode-placeholder row would corrupt the grid (§3.3). The §75
                  fallback box is the same height, so nothing reflows. */}
                  <InlineImagesProvider allowed={overlayEntry === undefined}>
                    {/* `flexShrink={0}` on every direct child of a height-constrained Box is
                    load-bearing, not decoration: Yoga's default lets children shrink to fit,
                    and Ink renders a shrunk child by *dropping rows out of the middle of it*,
                    which is precisely the corrupted timeline the owner reported — counts lines
                    painted over the previous post's header, bodies cut mid-word (verified
                    against Ink 7.1.1; see docs/agents/LEARNINGS.md). With `flexShrink={0}` the
                    overflow is clipped cleanly at the bottom instead. */}
                    <Box flexDirection="column" height={rows} width={columns} overflow="hidden">
                      {showRibbon ? (
                        <Box
                          flexDirection="column"
                          flexShrink={0}
                          height={ribbonRows}
                          paddingX={1}
                          overflow="hidden"
                        >
                          <StatusBar
                            width={Math.max(10, columns - 2)}
                            target={api.target}
                            breadcrumb={breadcrumb}
                            connection={serverInfoState.status}
                            refreshing={refreshing}
                            handle={session?.actor?.handle}
                            unreadCount={unreadCount}
                          />
                        </Box>
                      ) : null}
                      <Box
                        flexDirection="column"
                        flexShrink={0}
                        height={contentRows}
                        paddingX={1}
                        paddingY={1}
                        overflow="hidden"
                      >
                        {signedOutOnRoot ? (
                          <Text color={theme.muted} wrap="truncate-end">
                            Reading as a guest — press L to log in or create an account.
                          </Text>
                        ) : null}
                        <Box
                          flexDirection="row"
                          flexShrink={0}
                          width={regionColumns}
                          height={regionRows}
                          overflow="hidden"
                        >
                          <Box
                            flexDirection="column"
                            flexShrink={0}
                            width={contentColumns}
                            height={regionRows}
                            overflow="hidden"
                          >
                            {/* The screen stays mounted behind an overlay — hidden with
                            `display="none"`, never a zero height — so a sub-mode's
                            in-progress state and a list's scroll position survive
                            opening the palette. */}
                            <Box
                              flexDirection="column"
                              flexShrink={0}
                              display={overlayEntry === undefined ? 'flex' : 'none'}
                              overflow="hidden"
                            >
                              {screenRegion}
                            </Box>
                            {overlayEntry === undefined ? null : (
                              <Overlay
                                columns={contentColumns}
                                rows={regionRows}
                                overlayColumns={Math.min(
                                  overlayColumns,
                                  Math.max(20, contentColumns - 8),
                                )}
                                overlayRows={Math.min(overlayRows, regionRows)}
                                snapshotKey={`${overlayEntry.id}:${String(contentColumns)}x${String(regionRows)}`}
                                takeover={overlayTakeover}
                                background={
                                  <PlainModeProvider plain={plainEffective}>
                                    <ActiveThemeProvider theme={activeTheme}>
                                      {screenRegion}
                                    </ActiveThemeProvider>
                                  </PlainModeProvider>
                                }
                              >
                                {overlayNode}
                              </Overlay>
                            )}
                          </Box>
                          {drawerOpen ? (
                            <Drawer
                              width={DRAWER_COLUMNS}
                              height={regionRows}
                              title="Notifications"
                              focused
                            >
                              {session === undefined ? null : (
                                <NotificationsScreen
                                  api={api}
                                  isActive={screenIsActive && !pendingGo}
                                  ensureAccessToken={ensureAccessToken}
                                  onOpenPost={(postId) => {
                                    setDrawerRequested(false);
                                    openThread(postId);
                                  }}
                                  onOpenConversation={(conversationId) => {
                                    setDrawerRequested(false);
                                    setStack((s) =>
                                      push(s, { screen: 'messages', conversationId }),
                                    );
                                  }}
                                  onOpenAuthor={(actor) => {
                                    setDrawerRequested(false);
                                    openProfile(actor.id, actor);
                                  }}
                                  onReadStateChanged={() =>
                                    setUnreadNonce((current) => current + 1)
                                  }
                                />
                              )}
                            </Drawer>
                          ) : null}
                          {dmDrawerOpen ? (
                            <Drawer
                              width={DRAWER_COLUMNS}
                              height={regionRows}
                              title="Messages"
                              focused
                            >
                              {session === undefined ? null : (
                                <MessagesScreen
                                  api={messagesApi}
                                  isActive={screenIsActive && !pendingGo}
                                  viewerActorId={session.userId}
                                  dmRetentionDays={dmRetentionDays}
                                  glyphSet={glyphSet}
                                  verifiedPeers={verifiedPeers}
                                  e2eeCapabilityState={e2eeCapabilityState}
                                  sendE2ee={sendViaVault}
                                  conversationUnread={conversationUnreadFn}
                                  clearConversationUnread={clearConversationUnreadFn}
                                  receiveE2ee={receiveE2eeRows}
                                  e2eeVaultFault={e2eeVaultFault}
                                  // The screen owns backing out of its own thread/requests
                                  // sub-views on `Esc` (`backToList`) — this only fires once
                                  // it has nothing left to back out of, so the shell's own
                                  // blanket `Esc` handler below defers to it entirely rather
                                  // than racing it closed mid-thread.
                                  onBack={() => setDmDrawerRequested(false)}
                                  onOpenSafetyNumber={(actorId) => {
                                    setDmDrawerRequested(false);
                                    setStack((s) =>
                                      push(s, { screen: 'safetyNumber', targetActorId: actorId }),
                                    );
                                  }}
                                  onReadStateChanged={() =>
                                    setUnreadNonce((current) => current + 1)
                                  }
                                  refreshToken={feedNonce}
                                />
                              )}
                            </Drawer>
                          ) : null}
                        </Box>
                      </Box>

                      <Box
                        flexDirection="column"
                        flexShrink={0}
                        height={footerChromeRows}
                        paddingX={1}
                        overflow="hidden"
                      >
                        <Text color={theme.muted}>{'─'.repeat(Math.max(0, columns - 2))}</Text>
                        <Box height={1} flexShrink={0} overflow="hidden">
                          {toast === undefined ? <Text> </Text> : <ToastLine toast={toast} />}
                        </Box>
                        {showRibbon ? null : (
                          <StatusBar
                            width={Math.max(10, columns - 2)}
                            target={api.target}
                            breadcrumb={breadcrumb}
                            connection={serverInfoState.status}
                            refreshing={refreshing}
                            handle={session?.actor?.handle}
                            unreadCount={unreadCount}
                          />
                        )}
                        <HintLine
                          width={Math.max(10, columns - 2)}
                          keys={[
                            ...hintsFor(screen, {
                              authenticated: session !== undefined,
                              canGoBack: canGoBack(stack),
                            }),
                            // B-112: when the node itself is unreachable, surface the
                            // reporter on the same line the problem is described in.
                            ...(serverInfoState.status === 'error'
                              ? ['connection issues? :report']
                              : []),
                          ]}
                        />
                      </Box>
                    </Box>
                  </InlineImagesProvider>
                </KeyLayerProvider>
              </ModalStackProvider>
            </ActiveThemeProvider>
          </PlainModeProvider>
        </LinearModeProvider>
      </NowProvider>
    </MediaSessionProvider>
  );
}
