/**
 * The content every demo sandbox starts with (ADR 0044). Plain data: `DemoSandboxService`
 * turns it into real accounts, follows, posts, replies and likes through the ordinary
 * services, so a sandbox exercises the same code paths a real account does.
 *
 * Copy rules: no claim stronger than the product makes. Direct messages hide message *bodies*
 * from the node and nothing else (ADR 0036); the seed says so rather than "private".
 */

export interface DemoPersona {
  readonly key: 'maya' | 'jun' | 'ines';
  /** Lowercase ASCII; a per-sandbox suffix is appended so handles stay globally unique. */
  readonly handleBase: string;
  readonly displayName: string;
  readonly bio: string;
  readonly locationText: string;
}

export const DEMO_FRIENDS: readonly DemoPersona[] = [
  {
    key: 'maya',
    handleBase: 'maya',
    displayName: 'Maya Okafor',
    bio: 'Firmware by day, tiling window managers by night. Posts in monospace.',
    locationText: 'Lagos / Berlin',
  },
  {
    key: 'jun',
    handleBase: 'jun',
    displayName: 'Jun Watanabe',
    bio: 'Builds keyboards. Writes about them slowly.',
    locationText: 'Osaka',
  },
  {
    key: 'ines',
    handleBase: 'ines',
    displayName: 'Inês Carvalho',
    bio: 'Runs a small node for friends. Moderator of her own living room.',
    locationText: 'Porto',
  },
];

export type DemoAuthor = DemoPersona['key'] | 'you';

export interface DemoPostSeed {
  /** Stable key so replies and likes can point at a post inside this list. */
  readonly key: string;
  readonly author: DemoAuthor;
  /** `{you}` is replaced with the visitor's handle (a mention). */
  readonly body: string;
  /** How long before "now" the post appears to have been written. */
  readonly minutesAgo: number;
  readonly replyTo?: string;
  readonly likedBy?: readonly DemoAuthor[];
}

/** Ordered so every reply comes after the post it answers. */
export const DEMO_POSTS: readonly DemoPostSeed[] = [
  {
    key: 'terminal',
    author: 'maya',
    body: 'Rebuilt my terminal setup this weekend: three panes, zero mouse, and this feed in the right-hand one. Chronological, no ranking, nobody guessing what I want to see. #terminal',
    minutesAgo: 340,
    likedBy: ['jun', 'ines', 'you'],
  },
  {
    key: 'solder',
    author: 'jun',
    body: 'Third time re-soldering the same switch socket. The board is fine. The soldering is the problem. #keyboards',
    minutesAgo: 300,
    likedBy: ['maya'],
  },
  {
    key: 'node',
    author: 'ines',
    body: 'Running a small node for friends costs about as much as a coffee a month. The part nobody warns you about is that you become the moderator of your own living room.',
    minutesAgo: 270,
    likedBy: ['maya', 'jun', 'you'],
  },
  {
    key: 'hotswap',
    author: 'maya',
    body: 'Hot-swap sockets. I will say this once a month for the rest of your life.',
    minutesAgo: 240,
    replyTo: 'solder',
    likedBy: ['ines'],
  },
  {
    key: 'advice',
    author: 'jun',
    body: 'I have never once been able to follow advice.',
    minutesAgo: 235,
    replyTo: 'hotswap',
    likedBy: ['maya', 'ines'],
  },
  {
    key: 'e2ee',
    author: 'maya',
    body: 'Direct messages here are end-to-end encrypted. The node routes ciphertext and can still see who talks to whom and when, which is about as much as it should be able to see. #e2ee',
    minutesAgo: 180,
    likedBy: ['ines'],
  },
  {
    key: 'finish',
    author: 'ines',
    body: 'A feed with no ranking is a feed you can finish. Went to bed at a reasonable hour. Recommend.',
    minutesAgo: 120,
    likedBy: ['jun', 'you'],
  },
  {
    key: 'keycaps',
    author: 'jun',
    body: 'New keycaps arrived: matte, slightly purple. I would post a photo but I forgot to charge the camera, so imagine them.',
    minutesAgo: 90,
    likedBy: ['maya', 'ines'],
  },
  {
    key: 'welcome',
    author: 'maya',
    body: "@{you} welcome! If you've never used a terminal social app: j/k to move, enter to open, ? for help. The web version does the same things with fewer keys.",
    minutesAgo: 55,
    likedBy: ['you'],
  },
  {
    key: 'morning',
    author: 'ines',
    body: 'Anyone else read their feed in the morning and then... stop? Strange feeling. Good strange.',
    minutesAgo: 40,
    likedBy: ['maya', 'jun'],
  },
  {
    key: 'hello',
    author: 'you',
    body: 'Hello from the demo sandbox. Poking around.',
    minutesAgo: 25,
    likedBy: ['maya', 'jun', 'ines'],
  },
  {
    key: 'hello-reply',
    author: 'maya',
    body: 'Hello, you! Try the Messages tab next. @{you}',
    minutesAgo: 20,
    replyTo: 'hello',
    likedBy: ['you'],
  },
];

/** Who follows whom, as `[follower, followee]`. Everyone follows everyone: the home feed of
 * the visitor is the three friends, and each friend has the visitor as a follower. */
export const DEMO_FOLLOWS: ReadonlyArray<readonly [DemoAuthor, DemoAuthor]> = [
  ['you', 'maya'],
  ['you', 'jun'],
  ['you', 'ines'],
  ['maya', 'you'],
  ['jun', 'you'],
  ['ines', 'you'],
  ['maya', 'jun'],
  ['maya', 'ines'],
  ['jun', 'maya'],
  ['jun', 'ines'],
  ['ines', 'maya'],
  ['ines', 'jun'],
];
