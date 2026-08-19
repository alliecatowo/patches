/**
 * The one place every key binding is written down.
 *
 * The status bar's hint line (`hintsFor`) and the `?` help screen (`helpSections`)
 * are both derived from `KEYMAP`, so they can never disagree — the owner's report
 * that "go home, it doesn't show `c` anymore … help doesn't show much or anything
 * useful" was two hand-maintained lists drifting apart (spec §69: keybindings must
 * stay discoverable).
 *
 * Spec §191: a documented key is never rebound. Add bindings here; don't move them.
 */

/** Every screen the app shell can show. `App`'s navigation stack is a stack of these. */
export type Screen =
  | 'help'
  | 'login'
  | 'compose'
  | 'profile'
  | 'editProfile'
  | 'local'
  | 'home'
  | 'search'
  | 'thread'
  | 'bookmarks'
  | 'notifications'
  | 'report'
  | 'accounts'
  | 'page';

/** The two screens that can sit at the bottom of the navigation stack (spec §68). */
export const ROOT_SCREENS = ['home', 'local'] as const;
export type RootScreen = (typeof ROOT_SCREENS)[number];

export function isRootScreen(screen: Screen): screen is RootScreen {
  return (ROOT_SCREENS as readonly Screen[]).includes(screen);
}

/**
 * Screens that own the keyboard entirely (text entry) — the app-level keymap steps
 * aside, and only the screen's own bindings show in the status bar. `Esc` still
 * cancels back out of every one of them (that is the screen's own binding).
 */
export function capturesInput(screen: Screen): boolean {
  return (
    screen === 'login' ||
    screen === 'compose' ||
    screen === 'search' ||
    screen === 'report' ||
    screen === 'editProfile'
  );
}

export const KEY_GROUPS = [
  'Navigation',
  'Timeline',
  'Post actions',
  'Profile & social',
  'Pages',
  'Screens',
  'Account',
] as const;
export type KeyGroup = (typeof KEY_GROUPS)[number];

export interface Binding {
  /** How the key is written, e.g. `g h`, `Ctrl+S`, `j / ↓`. */
  keys: string;
  /** The two-or-three-word status-bar label, e.g. `compose`. */
  hint: string;
  /** The full sentence the help screen shows. Defaults to `hint` when omitted. */
  description?: string;
  group: KeyGroup;
  /** `'global'` = works from every non-text-entry screen; otherwise the screens it applies to. */
  on: 'global' | readonly Screen[];
  /** Only meaningful with a session — hidden from hints while signed out. */
  session?: boolean;
  /** Listed in the help screen but never in the status bar (rarely-pressed keys). */
  helpOnly?: boolean;
}

/** Screens that show a `PostList` and therefore share the timeline/post-action keys. */
const LIST_SCREENS: readonly Screen[] = ['home', 'local', 'bookmarks', 'profile', 'thread'];

export const KEYMAP: readonly Binding[] = [
  // --- Navigation -----------------------------------------------------------
  {
    keys: 'g h',
    hint: 'home',
    description: 'Home timeline — you and everyone you follow, newest first',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
  },
  {
    keys: 'g l',
    hint: 'local',
    description: 'Local timeline — every public post on this node, newest first',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
  },
  {
    keys: 'g p',
    hint: 'your profile',
    description: 'Your own profile and timeline',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
  },
  {
    keys: 'g e',
    hint: 'edit profile',
    description: 'Edit your display name, bio and nameplate — works from any screen',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
  },
  {
    keys: 'g b',
    hint: 'bookmarks',
    description: 'Posts you bookmarked (private to you)',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
  },
  {
    keys: 'g n',
    hint: 'notifications',
    description: 'Replies, likes and follows addressed to you',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
  },
  {
    keys: 'g v',
    hint: 'your page',
    description: 'Your Patches Page — creates an empty one if you have none yet',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
  },
  {
    keys: 'g s',
    hint: 'search',
    description: 'Search people and posts (same as /)',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
  },
  {
    keys: '/',
    hint: 'search',
    description: 'Search people and posts',
    group: 'Navigation',
    on: 'global',
  },
  {
    keys: 'Esc',
    hint: 'back',
    description: 'Back one screen — always exactly one level, from every screen',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
  },
  {
    keys: 'q',
    hint: 'quit',
    description: 'Back one screen; quits Patches when you are already at the root timeline',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
  },
  {
    keys: 'Ctrl+C',
    hint: 'quit',
    description: 'Quit Patches immediately, from anywhere',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
  },

  // --- Timeline -------------------------------------------------------------
  {
    keys: 'j / ↓',
    hint: 'next',
    description: 'Move down one post',
    group: 'Timeline',
    on: LIST_SCREENS,
  },
  {
    keys: 'k / ↑',
    hint: 'prev',
    description: 'Move up one post',
    group: 'Timeline',
    on: LIST_SCREENS,
    helpOnly: true,
  },
  {
    keys: 'n / space',
    hint: 'more',
    description: 'Load the next page of posts (keyset cursor, never a page number)',
    group: 'Timeline',
    on: LIST_SCREENS,
    helpOnly: true,
  },
  {
    keys: 'R',
    hint: 'refresh',
    description: 'Refresh from the server — re-reads like/bookmark state and shows what is new',
    group: 'Timeline',
    on: 'global',
  },
  {
    keys: 'v',
    hint: 'reveal',
    description: 'Reveal (or re-hide) a content warning on the selected post',
    group: 'Timeline',
    on: LIST_SCREENS,
    helpOnly: true,
  },

  // --- Post actions ---------------------------------------------------------
  {
    keys: 'Enter',
    hint: 'thread',
    description: 'Open the selected post’s thread',
    group: 'Post actions',
    on: LIST_SCREENS,
  },
  {
    keys: 'p',
    hint: 'author',
    description: 'Open the selected post’s author profile',
    group: 'Post actions',
    on: LIST_SCREENS,
  },
  {
    keys: 'r',
    hint: 'reply',
    description: 'Reply to the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
  },
  {
    keys: 'l',
    hint: 'like',
    description: 'Like / unlike the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
  },
  {
    keys: 'b',
    hint: 'bookmark',
    description: 'Bookmark / unbookmark the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
  },
  {
    keys: 'f',
    hint: 'follow',
    description: 'Follow / unfollow the selected post’s author',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
  },
  {
    keys: 'o',
    hint: 'open media',
    description: 'Download and open the selected post’s first attachment',
    group: 'Post actions',
    on: LIST_SCREENS,
    helpOnly: true,
  },
  {
    keys: '!',
    hint: 'report',
    description: 'Report the selected post to this node’s moderators',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    helpOnly: true,
  },
  {
    keys: 'c',
    hint: 'compose',
    description: 'Compose a new post',
    group: 'Post actions',
    on: 'global',
    session: true,
  },

  // --- Profile & social -----------------------------------------------------
  {
    keys: 'f',
    hint: 'follow',
    description: 'Follow / unfollow the profile you are looking at',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
  },
  {
    keys: 'e',
    hint: 'edit',
    description: 'Edit your profile (on your own profile only)',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
  },
  {
    keys: 'v',
    hint: 'visit page',
    description: 'Open this actor’s Patches Page',
    group: 'Profile & social',
    on: ['profile'],
  },
  {
    keys: 'B',
    hint: 'block',
    description: 'Block / unblock this actor (asks y/n first)',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
    helpOnly: true,
  },
  {
    keys: 'M',
    hint: 'mute',
    description: 'Mute / unmute this actor (asks y/n first)',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
    helpOnly: true,
  },

  // --- Pages ----------------------------------------------------------------
  {
    keys: '[ / ]',
    hint: 'sub-page',
    description: 'Previous / next sub-page',
    group: 'Pages',
    on: ['page'],
  },
  {
    keys: 'j / k',
    hint: 'select link',
    description: 'Move between the links on this page',
    group: 'Pages',
    on: ['page'],
  },
  {
    keys: 'Enter',
    hint: 'open link',
    description: 'Open the selected link in your browser',
    group: 'Pages',
    on: ['page'],
  },
  {
    keys: 'e',
    hint: 'edit',
    description: 'Edit the raw page document in $VISUAL/$EDITOR (your own page)',
    group: 'Pages',
    on: ['page'],
    session: true,
  },
  {
    keys: 'E',
    hint: 'block editor',
    description: 'Structured block-by-block page editor (your own page)',
    group: 'Pages',
    on: ['page'],
    session: true,
    helpOnly: true,
  },
  {
    keys: 's',
    hint: 'sign guestbook',
    description: 'Sign this page’s guestbook',
    group: 'Pages',
    on: ['page'],
    session: true,
    helpOnly: true,
  },

  // --- Screens (per-screen, non-timeline) -----------------------------------
  {
    keys: 'Ctrl+S',
    hint: 'post',
    description: 'Send the post you are writing',
    group: 'Screens',
    on: ['compose'],
  },
  {
    keys: 'Ctrl+A',
    hint: 'attach',
    description: 'Attach an image to the post you are writing',
    group: 'Screens',
    on: ['compose'],
  },
  {
    keys: 'Esc',
    hint: 'keep draft',
    description: 'Leave compose, keeping the draft for next time',
    group: 'Screens',
    on: ['compose'],
  },
  {
    keys: 'Tab',
    hint: 'people/posts',
    description: 'Switch the search between people and posts',
    group: 'Screens',
    on: ['search'],
  },
  {
    keys: 'Enter',
    hint: 'search/open',
    description: 'Run the search, then open the selected result',
    group: 'Screens',
    on: ['search'],
  },
  { keys: 'Esc', hint: 'cancel', group: 'Screens', on: ['search', 'login', 'report'] },
  {
    keys: 'j / k',
    hint: 'reason',
    description: 'Choose a report reason',
    group: 'Screens',
    on: ['report'],
  },
  {
    keys: 'Ctrl+S',
    hint: 'submit',
    description: 'Send the report',
    group: 'Screens',
    on: ['report'],
  },
  {
    keys: 'Tab / ↑↓',
    hint: 'move',
    description: 'Move between profile fields',
    group: 'Screens',
    on: ['editProfile'],
  },
  {
    keys: 'Ctrl+S',
    hint: 'save',
    description: 'Save your profile',
    group: 'Screens',
    on: ['editProfile'],
  },
  { keys: 'Esc', hint: 'cancel', group: 'Screens', on: ['editProfile'] },
  {
    keys: 'j / k',
    hint: 'move',
    description: 'Move between notifications',
    group: 'Screens',
    on: ['notifications'],
  },
  {
    keys: 'Enter',
    hint: 'open',
    description: 'Open the post or actor a notification is about',
    group: 'Screens',
    on: ['notifications'],
  },
  {
    keys: 'm',
    hint: 'mark all read',
    description: 'Mark every notification read',
    group: 'Screens',
    on: ['notifications'],
  },
  {
    keys: 'a',
    hint: 'add key',
    description: 'Enroll an SSH key on this account',
    group: 'Screens',
    on: ['accounts'],
  },
  {
    keys: 'x',
    hint: 'log out',
    description: 'Sign out of this account',
    group: 'Screens',
    on: ['accounts'],
  },
  {
    keys: 'j / k',
    hint: 'scroll',
    description: 'Scroll this help screen',
    group: 'Screens',
    on: ['help'],
  },

  // --- Account --------------------------------------------------------------
  {
    keys: 'L',
    hint: 'account',
    description: 'Log in / register, or open your account screen when signed in',
    group: 'Account',
    on: 'global',
    helpOnly: true,
  },
  {
    keys: 'P',
    hint: 'plain mode',
    description: 'Toggle plain mode — strips every colour, glyph and border (spec §173)',
    group: 'Account',
    on: 'global',
    helpOnly: true,
  },
  {
    keys: '?',
    hint: 'help',
    description: 'Open or close this help screen',
    group: 'Account',
    on: 'global',
  },
];

export interface HintContext {
  authenticated: boolean;
  /** False at the root of the navigation stack, where `q` quits instead of going back. */
  canGoBack: boolean;
}

function label(binding: Binding): string {
  return `${binding.keys} ${binding.hint}`;
}

function appliesTo(binding: Binding, screen: Screen): boolean {
  return binding.on !== 'global' && binding.on.includes(screen);
}

/** Deduped by rendered label — several groups legitimately bind the same key. */
function dedupe(labels: readonly string[]): string[] {
  return [...new Set(labels)];
}

/**
 * The status-bar hint line: this screen's own keys first, then the four that are
 * always true. Text-entry screens get only their own keys — the global keymap is
 * standing aside while you type.
 */
export function hintsFor(screen: Screen, context: HintContext): string[] {
  const own = KEYMAP.filter(
    (binding) =>
      appliesTo(binding, screen) &&
      binding.helpOnly !== true &&
      (binding.session !== true || context.authenticated),
  ).map(label);

  if (capturesInput(screen)) return dedupe(own);

  const tail = KEYMAP.filter(
    (binding) =>
      binding.on === 'global' &&
      binding.helpOnly !== true &&
      (binding.session !== true || context.authenticated),
  ).map(label);

  return dedupe([...own, ...tail, context.canGoBack ? 'Esc back' : 'q quit']);
}

export interface HelpSection {
  group: KeyGroup;
  bindings: readonly Binding[];
}

/** Every binding, grouped, for the `?` screen. Nothing is filtered out — help is
 * the complete reference, including keys that are not available right now. */
export function helpSections(): HelpSection[] {
  return KEY_GROUPS.map((group) => ({
    group,
    bindings: KEYMAP.filter((binding) => binding.group === group),
  })).filter((section) => section.bindings.length > 0);
}

/** The human name of a screen, for the help screen's "you are here" line. */
export const SCREEN_TITLES: Readonly<Record<Screen, string>> = {
  help: 'Help',
  login: 'Log in',
  compose: 'Compose',
  profile: 'Profile',
  editProfile: 'Edit profile',
  local: 'Local',
  home: 'Home',
  search: 'Search',
  thread: 'Thread',
  bookmarks: 'Bookmarks',
  notifications: 'Notifications',
  report: 'Report',
  accounts: 'Account',
  page: 'Page',
};
