# Product principles

Patches is a terminal-native social network. This document is the short version of
`INITIAL_VISION.md` that a product or engineering decision can be checked against day to
day. When this document and the vision spec disagree, the spec wins — file a correction here
instead of drifting silently.

## The thesis

> The server should determine what content a user is authorized to access. It should not
> determine what content is psychologically optimized to capture that user's attention.

Concretely: **the server provides the social graph and content; the client decides how to
arrange it.** The backend's job is identity, authorization, storage, and synchronization. It
is explicitly not the backend's job to decide what a person should look at next. That
decision belongs to the client, and initially to the person, full stop.

## Vocabulary

Use these terms consistently across code, docs, and product copy:

- **Actor** — a social identity, local or remote (federation-ready from day one).
- **User** — a local authenticated account with credentials. Every User has an Actor; not
  every Actor has a User (remote actors won't, once federation exists).
- **Post** — a root social object or a reply.
- **Thread** — a post and its reply tree.
- **Home** — chronological posts from followed actors plus the current actor.
- **Local** — chronological public posts originating on this Patches instance.
- **Media** — an image attachment.
- **Feed** — a client-visible ordered collection of posts.

"Patch" is not a generic noun for every database concept just because the product is named
Patches — resist that urge. Avoid forced cute terminology when a plain technical term is
clearer.

## Core principles

### 1. Chronological by default

The home feed is ordered `created_at DESC, id DESC`. No engagement ranking, no hidden
relevance score, no recommendation score, no "top posts," no silent reranking. If a feed's
order ever needs explaining, that's a bug.

### 2. No infinite engagement machinery

No autoplay, no video, no reels, no stories, no engagement streaks, no algorithmic
recommendations, no notification-frequency optimization tuned for compulsion, no view
counts, no impressions, no creator monetization scores, no follower-growth charts, no
trending ragebait, no targeted advertising. Pagination is fine — an explicit "load more" is
preferable to endless automatic scroll, because it keeps the decision to keep scrolling in
the user's hands.

### 3. Text and images are first-class

v0 content types are plain text, static photos, links, and replies combining text with
optional images. No video, no audio, no animated GIF requirement in v0. This isn't a
permanent ceiling — it's a sequencing choice, so the core social loop ships before media
complexity does.

### 4. Personal identity matters

Profiles should eventually feel more expressive than the sterile profile grids of modern
social apps — closer to a personal homepage than a corporate directory listing. v0 profile
fields: avatar, display name, `@handle`, bio, optional location text, optional personal URL,
joined date. A pinned post comes later. Longer-term ideas — profile theme, profile song,
guestbook, Top 8, custom profile links — are real intentions, not filler; they wait for
safe, bounded customization primitives. No arbitrary HTML/CSS on profiles, ever, in this
architecture.

### 5. Small social interactions over metrics

Likes/favorites may exist. If they do: the current user needs to know whether _they_ liked
something; authors may see aggregate counts; aggregate counts do not get to dominate the
timeline UI. No leaderboards, ever.

### 6. Open architecture

The TUI is one client, not _the_ architecture. The backend must never embed
terminal-specific assumptions into its domain layer. React Native, a desktop GUI, a browser
client, and third-party clients are all expected consumers of the same protocol eventually.
If a domain service can only make sense to a terminal client, it's in the wrong layer.

## Explicit non-goals for v0/MVP

These are not forgotten — they are deliberately deferred until the core product is real and
stable:

DMs, group DMs, voice, video, stories, live streaming, ads, payment processing, premium
subscriptions, creator monetization, a full-text Elasticsearch cluster, AI moderation, ML
ranking, recommendations, arbitrary server-side BYO algorithm execution, ActivityPub
federation, AT Protocol federation, multi-region active-active databases, sharded
databases, Kubernetes, Redis, Kafka, RabbitMQ, event-sourcing the whole application,
GraphQL, microservices split by domain, a React web social client, custom profile HTML,
executable profile JavaScript, plugins downloaded from untrusted users, end-to-end
encrypted chat, quote-post mechanics, anonymous posting.

## The feed-rule DSL vision (BYO algorithm, without the surveillance)

The server must never expose an engagement-ranked default. Client-side feed control is a
staged roadmap, not a big-bang feature:

- **A0 — chronological.** The only algorithm. This is where v0 and MVP live.
- **A1 — built-in client filters.** Following, local, photos-only, text-only, an
  "unread-ish" view, specific actors — filters over the chronological stream, still no
  ranking.
- **A2 — declarative local feed definitions.** A data-only DSL a person can write for
  themselves, e.g.:

  ```toml
  name = "friends + techno"
  sort = "newest"

  [[sources]]
  type = "following"

  [[sources]]
  type = "tag"
  value = "techno"

  [[exclude]]
  type = "muted"
  ```

  or the TypeScript-flavored equivalent:

  ```ts
  feed({
    sources: [following(), tag('techno')],
    exclude: [muted(), reposts()],
    sort: newestFirst(),
  });
  ```

- **A3 — shareable feed definitions.** `patches feed install alice/friends-and-raves` —
  people publish and install each other's feed definitions.

Feed rules execute on the client whenever practical. Feed definitions must be **data, not
arbitrary executable code** — no user-uploaded scripts, no remote JS plugins. This keeps
"you control your algorithm" from becoming "you can be social-engineered into running
someone else's malware."

## How to use this document

If a feature proposal contradicts a principle here, that's a signal to stop and resolve the
tension explicitly — either the principle is wrong (rare, and worth an ADR) or the feature
needs to change. Silent exceptions are how every good-intentioned social product ends up
back where Patches started as a reaction against.
