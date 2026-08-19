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
  | 'messages'
  | 'communities'
  | 'tagFeed'
  | 'preferences'
  | 'postEdit'
  | 'postHistory'
  | 'report'
  | 'accounts'
  | 'page';

/** The two screens that can sit at the bottom of the navigation stack (spec §68). */
export const ROOT_SCREENS = ['home', 'local'] as const;
export type RootScreen = (typeof ROOT_SCREENS)[number];

export function isRootScreen(screen: Screen): screen is RootScreen {
  return (ROOT_SCREENS as readonly Screen[]).includes(screen);
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

export type CommandArgument = 'none' | 'optional' | 'required';

export interface CommandAlias {
  /** Command name without the leading `:`. */
  name: string;
  argument?: CommandArgument;
  usage?: string;
}

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
  /** Focus scope used by duplicate-key validation. */
  region?: 'shell' | 'list' | 'screen' | 'editor' | 'modal';
  /** Vim-style aliases. These resolve back to this binding; they are not handlers. */
  commands?: readonly CommandAlias[];
  destructive?: boolean;
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
    region: 'shell',
    commands: [{ name: 'home' }],
  },
  {
    keys: 'g l',
    hint: 'local',
    description: 'Local timeline — every public post on this node, newest first',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'local' }],
  },
  {
    keys: 'g p',
    hint: 'your profile',
    description: 'Your own profile and timeline',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'profile', argument: 'optional', usage: 'profile [@handle]' }],
  },
  {
    keys: 'g d',
    hint: 'messages',
    description: 'Direct-message conversations',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'messages' }],
  },
  {
    keys: 'g c',
    hint: 'communities',
    description: 'Communities on this node',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'communities' }],
  },
  {
    keys: 'g e',
    hint: 'edit profile',
    description: 'Edit your display name, bio and nameplate — works from any screen',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
  },
  {
    keys: 'g b',
    hint: 'bookmarks',
    description: 'Posts you bookmarked (private to you)',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'bookmarks' }],
  },
  {
    keys: 'g n',
    hint: 'notifications',
    description: 'Replies, likes and follows addressed to you',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'notifications' }],
  },
  {
    keys: 'g v',
    hint: 'your page',
    description: 'Your Patches Page — creates an empty one if you have none yet',
    group: 'Navigation',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'page', argument: 'optional', usage: 'page [@handle[/slug]]' }],
  },
  {
    keys: 'g s',
    hint: 'search',
    description: 'Search people and posts (same as /)',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
    region: 'shell',
  },
  {
    keys: '/',
    hint: 'search',
    description: 'Search people and posts',
    group: 'Navigation',
    on: 'global',
    region: 'shell',
    commands: [{ name: 'search', argument: 'required', usage: 'search <query>' }],
  },
  {
    keys: 'Esc',
    hint: 'back',
    description: 'Back one screen — always exactly one level, from every screen',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'back' }],
  },
  {
    keys: 'q',
    hint: 'quit',
    description: 'Back one screen; quits Patches when you are already at the root timeline',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'q' }, { name: 'quit' }],
  },
  {
    keys: 'Ctrl+C',
    hint: 'quit',
    description: 'Quit Patches immediately, from anywhere',
    group: 'Navigation',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    destructive: true,
    commands: [{ name: 'q!' }],
  },

  // --- Timeline -------------------------------------------------------------
  {
    keys: 'j / ↓',
    hint: 'next',
    description: 'Move down one post',
    group: 'Timeline',
    on: LIST_SCREENS,
    region: 'list',
  },
  {
    keys: 'k / ↑',
    hint: 'prev',
    description: 'Move up one post',
    group: 'Timeline',
    on: LIST_SCREENS,
    region: 'list',
    helpOnly: true,
  },
  {
    keys: 'n / space',
    hint: 'more',
    description: 'Load the next page of posts (keyset cursor, never a page number)',
    group: 'Timeline',
    on: LIST_SCREENS,
    region: 'list',
    helpOnly: true,
  },
  {
    keys: 'Ctrl+R',
    hint: 'refresh',
    description: 'Refresh from the server — re-reads like/bookmark state and shows what is new',
    group: 'Timeline',
    on: 'global',
    region: 'shell',
    commands: [{ name: 'reload' }],
  },
  {
    keys: 'v',
    hint: 'reveal',
    description: 'Reveal (or re-hide) a content warning on the selected post',
    group: 'Timeline',
    on: LIST_SCREENS,
    helpOnly: true,
    region: 'list',
  },

  // --- Post actions ---------------------------------------------------------
  {
    keys: 'Enter',
    hint: 'thread',
    description: 'Open the selected post’s thread',
    group: 'Post actions',
    on: LIST_SCREENS,
    region: 'list',
  },
  {
    keys: 'p',
    hint: 'author',
    description: 'Open the selected post’s author profile',
    group: 'Post actions',
    on: LIST_SCREENS,
    region: 'list',
  },
  {
    keys: 'r',
    hint: 'reply',
    description: 'Reply to the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    region: 'list',
  },
  {
    keys: 'l',
    hint: 'like',
    description: 'Like / unlike the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    region: 'list',
  },
  {
    keys: 'b',
    hint: 'bookmark',
    description: 'Bookmark / unbookmark the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    region: 'list',
  },
  {
    keys: 'f',
    hint: 'follow',
    description: 'Follow / unfollow the selected post’s author',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    region: 'list',
  },
  {
    keys: 'o',
    hint: 'open media',
    description: 'Download and open the selected post’s first attachment',
    group: 'Post actions',
    on: LIST_SCREENS,
    helpOnly: true,
    region: 'list',
  },
  {
    keys: '!',
    hint: 'report',
    description: 'Report the selected post to this node’s moderators',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    helpOnly: true,
    region: 'list',
  },
  {
    keys: 'c',
    hint: 'compose',
    description: 'Compose a new post',
    group: 'Post actions',
    on: 'global',
    session: true,
    region: 'shell',
  },
  {
    keys: 'R',
    hint: 'repost',
    description: 'Repost / unrepost the selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    region: 'list',
    commands: [{ name: 'repost' }],
  },
  {
    keys: 'Q',
    hint: 'quote',
    description: 'Quote the selected post in a new post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    region: 'list',
  },
  {
    keys: 'E',
    hint: 'edit post',
    description: 'Edit your selected post',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    helpOnly: true,
    region: 'list',
  },
  {
    keys: 'd',
    hint: 'delete post',
    description: 'Delete your selected post after confirmation',
    group: 'Post actions',
    on: LIST_SCREENS,
    session: true,
    helpOnly: true,
    region: 'list',
    destructive: true,
  },
  {
    keys: 'H',
    hint: 'history',
    description: 'View the selected post’s edit history',
    group: 'Post actions',
    on: LIST_SCREENS,
    helpOnly: true,
    region: 'list',
  },
  {
    keys: 't',
    hint: 'tags',
    description: 'Search tags',
    group: 'Post actions',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'tag', argument: 'required', usage: 'tag <name>' }],
  },
  {
    keys: '#',
    hint: 'tag feed',
    description: 'Open the selected post’s first tag timeline',
    group: 'Post actions',
    on: LIST_SCREENS,
    helpOnly: true,
    region: 'list',
  },

  // --- Profile & social -----------------------------------------------------
  {
    keys: 'f',
    hint: 'follow',
    description: 'Follow / unfollow the profile you are looking at',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
    region: 'screen',
  },
  {
    keys: 'e',
    hint: 'edit',
    description: 'Edit your profile (on your own profile only)',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
    region: 'screen',
  },
  {
    keys: 'v',
    hint: 'visit page',
    description: 'Open this actor’s Patches Page',
    group: 'Profile & social',
    on: ['profile'],
    region: 'screen',
  },
  {
    keys: 'B',
    hint: 'block',
    description: 'Block / unblock this actor (asks y/n first)',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
    helpOnly: true,
    region: 'screen',
    destructive: true,
  },
  {
    keys: 'M',
    hint: 'mute',
    description: 'Mute / unmute this actor (asks y/n first)',
    group: 'Profile & social',
    on: ['profile'],
    session: true,
    helpOnly: true,
    region: 'screen',
    destructive: true,
  },
  {
    keys: 'J',
    hint: 'join / leave',
    description: 'Join or leave the community you are viewing',
    group: 'Profile & social',
    on: ['communities'],
    session: true,
    region: 'screen',
  },

  // --- Pages ----------------------------------------------------------------
  {
    keys: '[ / ]',
    hint: 'sub-page',
    description: 'Previous / next sub-page',
    group: 'Pages',
    on: ['page'],
    region: 'screen',
  },
  {
    keys: 'j / k',
    hint: 'select link',
    description: 'Move between the links on this page',
    group: 'Pages',
    on: ['page'],
    region: 'screen',
  },
  {
    keys: 'Enter',
    hint: 'open link',
    description: 'Open the selected link in your browser',
    group: 'Pages',
    on: ['page'],
    region: 'screen',
  },
  {
    keys: 'e',
    hint: 'edit',
    description: 'Edit the raw page document in $VISUAL/$EDITOR (your own page)',
    group: 'Pages',
    on: ['page'],
    session: true,
    region: 'screen',
  },
  {
    keys: 'E',
    hint: 'block editor',
    description: 'Structured block-by-block page editor (your own page)',
    group: 'Pages',
    on: ['page'],
    session: true,
    helpOnly: true,
    region: 'screen',
  },
  {
    keys: 's',
    hint: 'sign guestbook',
    description: 'Sign this page’s guestbook',
    group: 'Pages',
    on: ['page'],
    session: true,
    helpOnly: true,
    region: 'screen',
  },

  // --- Screens (per-screen, non-timeline) -----------------------------------
  {
    keys: 'Ctrl+S',
    hint: 'post',
    description: 'Send the post you are writing',
    group: 'Screens',
    on: ['compose'],
    region: 'editor',
    commands: [{ name: 'w' }, { name: 'post' }, { name: 'wq' }],
  },
  {
    keys: 'Ctrl+A',
    hint: 'attach',
    description: 'Attach an image to the post you are writing',
    group: 'Screens',
    on: ['compose'],
    region: 'editor',
  },
  {
    keys: 'Esc',
    hint: 'keep draft',
    description: 'Leave compose, keeping the draft for next time',
    group: 'Screens',
    on: ['compose'],
    region: 'editor',
  },
  {
    keys: 'Tab',
    hint: 'people/posts',
    description: 'Switch the search between people and posts',
    group: 'Screens',
    on: ['search'],
    region: 'editor',
  },
  {
    keys: 'Enter',
    hint: 'search/open',
    description: 'Run the search, then open the selected result',
    group: 'Screens',
    on: ['search'],
    region: 'editor',
  },
  {
    keys: 'Esc',
    hint: 'cancel',
    group: 'Screens',
    on: ['search', 'login', 'report'],
    region: 'editor',
  },
  {
    keys: 'j / k',
    hint: 'reason',
    description: 'Choose a report reason',
    group: 'Screens',
    on: ['report'],
    region: 'editor',
  },
  {
    keys: 'Ctrl+S',
    hint: 'submit',
    description: 'Send the report',
    group: 'Screens',
    on: ['report'],
    region: 'editor',
  },
  {
    keys: 'Tab / ↑↓',
    hint: 'move',
    description: 'Move between profile fields',
    group: 'Screens',
    on: ['editProfile'],
    region: 'editor',
  },
  {
    keys: 'Ctrl+S',
    hint: 'save',
    description: 'Save your profile',
    group: 'Screens',
    on: ['editProfile'],
    region: 'editor',
  },
  { keys: 'Esc', hint: 'cancel', group: 'Screens', on: ['editProfile'], region: 'editor' },
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
    region: 'shell',
  },
  {
    keys: 'P',
    hint: 'plain mode',
    description: 'Toggle plain mode — strips every colour, glyph and border (spec §173)',
    group: 'Account',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'plain', argument: 'optional', usage: 'plain [on|off|toggle]' }],
  },
  {
    keys: '~',
    hint: 'quiet feed',
    description: 'Toggle other actors’ cosmetic decoration',
    group: 'Account',
    on: 'global',
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'quiet', argument: 'optional', usage: 'quiet [on|off|toggle]' }],
  },
  {
    keys: ',',
    hint: 'preferences',
    description: 'Open display and account preferences',
    group: 'Account',
    on: 'global',
    session: true,
    helpOnly: true,
    region: 'shell',
    commands: [{ name: 'theme', argument: 'required', usage: 'theme <name>' }],
  },
  {
    keys: ': / Ctrl+P',
    hint: 'commands',
    description: 'Open the command palette and Vim-style command line',
    group: 'Account',
    on: 'global',
    region: 'shell',
  },
  {
    keys: '?',
    hint: 'help',
    description: 'Open or close this help screen',
    group: 'Account',
    on: 'global',
    region: 'shell',
    commands: [{ name: 'help' }],
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

  const tail = KEYMAP.filter(
    (binding) =>
      binding.on === 'global' &&
      binding.helpOnly !== true &&
      (binding.session !== true || context.authenticated),
  ).map(label);

  // Legacy text screens still own printable input while they migrate to
  // `useKeyLayer`. Keep their concise editor hints, plus the two shell escape
  // hatches that remain reachable from every text/sub-mode layer.
  const hasEditorLayer = KEYMAP.some(
    (binding) => appliesTo(binding, screen) && binding.region === 'editor',
  );
  if (hasEditorLayer) {
    return dedupe([...own, ': / Ctrl+P commands', 'Ctrl+C quit']);
  }

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

function keyAlternatives(keys: string): readonly string[] {
  return keys.split(/\s+\/\s+/).map((key) => key.trim());
}

/** Returns every duplicate key in one screen+region and every duplicate command alias. */
export function validateKeymap(bindings: readonly Binding[]): readonly string[] {
  const errors: string[] = [];
  const keys = new Map<string, Binding>();
  const commands = new Map<string, Binding>();

  for (const binding of bindings) {
    const scopes =
      binding.on === 'global'
        ? [`global:${binding.region ?? 'shell'}`]
        : binding.on.map((screen) => `${screen}:${binding.region ?? 'screen'}`);
    for (const scope of scopes) {
      for (const key of keyAlternatives(binding.keys)) {
        const token = `${scope}:${key}`;
        const previous = keys.get(token);
        if (previous === undefined) keys.set(token, binding);
        else errors.push(`${scope} binds ${key} to both “${previous.hint}” and “${binding.hint}”`);
      }
    }
    for (const command of binding.commands ?? []) {
      const name = command.name.toLowerCase();
      const previous = commands.get(name);
      if (previous === undefined) commands.set(name, binding);
      else errors.push(`:${name} aliases both “${previous.hint}” and “${binding.hint}”`);
    }
  }
  return errors;
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
  messages: 'Messages',
  communities: 'Communities',
  tagFeed: 'Tags',
  preferences: 'Preferences',
  postEdit: 'Edit post',
  postHistory: 'Post history',
  report: 'Report',
  accounts: 'Account',
  page: 'Page',
};
