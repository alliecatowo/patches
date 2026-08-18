# Product principles

Patches is terminal-native social-network software. A deployment is a **node**;
`patches.social` is the flagship hosted node — the reference node, not "the backend". This
document is the short version of `INITIAL_VISION.md` that a product or engineering decision
can be checked against day to day. When this document and the vision spec disagree, the spec
wins — file a correction here instead of drifting silently.

Incorporates **Amendment A** (`INITIAL_VISION.md` §162–§177): the node model, credentials
separated from identity, Patches Pages, nameplates, and capabilities-not-tiers.

## The thesis

> The server should determine what content a user is authorized to access. It should not
> determine what content is psychologically optimized to capture that user's attention.

Concretely: **the server provides the social graph and content; the client decides how to
arrange it.** A node's job is identity, authorization, storage, and synchronization. It is
explicitly not a node's job to decide what a person should look at next. That decision
belongs to the client, and initially to the person, full stop.

## The five pillars

The one-paragraph version of what Patches is, in priority order (§175):

1. **Social without engagement optimization.** Chronological, no ranking, no metrics theater.
2. **Terminal-native multimedia social computing.** The terminal is the primary surface, not
   a novelty port.
3. **Personal web revival.** Every actor has a Page.
4. **Local ownership, federated network.** Every deployment is a node; `patches.social` is
   the reference node, not the center.
5. **Clients are powerful.** Portable data — feeds, pages, nameplates — rendered by Ink, the
   web, mobile, or third-party clients.

The numbered principles below are the working detail behind these.

## Vocabulary

Use these terms consistently across code, docs, and product copy:

- **Node** — a Patches deployment, authoritative for its own local actors. Prefer "node" over
  "instance" or "server" in product language. `patches.social` is the **reference node**.
- **Actor** — a social identity, local or remote. Addressed `@handle@domain`; a handle is
  unique within a node only.
- **User** — a local authenticated account. Every User has an Actor; not every Actor has a
  User (remote actors won't).
- **Credential** — a way to prove you are a user (password, SSH key, GitHub). **Not an
  identity** — how you log in never determines who you are.
- **Page** — an actor's portable declarative personal site, stored on their node and rendered
  by clients. What you _visit_.
- **Nameplate** — an actor's inline identity presentation (name color, glyph, badges, frame,
  status line). What you see _next to a name_.
- **Post** — a root social object or a reply.
- **Thread** — a post and its reply tree.
- **Home** — chronological posts from followed actors plus the current actor.
- **Local** — chronological public posts originating on _this node_.
- **Media** — an image attachment.
- **Feed** — a client-visible ordered collection of posts.
- **Capability** — a feature a node grants a user. There are no tiers in the protocol.

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

### 4. Personal identity matters — the personal web, revived

Profiles should feel more expressive than the sterile profile grids of modern social apps —
closer to a personal homepage than a corporate directory listing. This is a **pillar**, not a
someday-feature.

Two distinct surfaces:

- A **Page** (§170) is an actor's personal site: a portable declarative document — theme,
  sub-pages, and blocks (Text, Markdown, Image, Links, Posts, Top 8, Guestbook, …) — stored
  on their node and rendered by _clients_. The server never renders it. Profile theme,
  guestbook, and Top 8 aren't "longer-term ideas" anymore; they're Page blocks, scheduled in
  Phase 4.5.
- A **nameplate** (§173) is how you appear everywhere your name appears: name color, glyph,
  server-attested badges, avatar frame, status line. It degrades with terminal capability and
  never wins against readability. Badge text is server-attested — users can't write their own,
  because free-text badges are handle spoofing with extra steps.

The guardrail is unchanged and now precise: **a Page is inert data, never executable code**,
in any client, ever. No user React, MDX, JS, or template language. A future web-only advanced
mode may allow user HTML/CSS, but only on an isolated origin with `script-src 'none'`, never
same-origin with the app. Visiting someone's page must never run their code.

### 5. Small social interactions over metrics

Likes/favorites may exist. If they do: the current user needs to know whether _they_ liked
something; authors may see aggregate counts; aggregate counts do not get to dominate the
timeline UI. No leaderboards, ever.

### 6. Open architecture

The TUI is one client, not _the_ architecture. The backend must never embed
terminal-specific assumptions into its domain layer. React Native, a desktop GUI, a browser
client, and third-party clients are all expected consumers of the same protocol eventually.
If a domain service can only make sense to a terminal client, it's in the wrong layer.

### 7. Local ownership, federated network

Every deployment is a node. `patches.social` is the reference node, not the center: no global
user database, no central account service, no registry a node needs to function. A node runs
standalone, self-hosting is a shipped goal (v0.2), and your data is exportable and eventually
portable between nodes — never gated behind a payment.

### 8. Clients are powerful

Feeds, pages, and nameplates are portable **data**. The Ink renderer, a future web renderer,
mobile, and third-party clients all consume the same documents; none is privileged, and none
is a translation of another. The server decides what you're authorized to see. It never
decides how it looks.

Note: Ink does not render HTML — it renders a React component tree to a terminal via Yoga
flexbox layout. That's precisely why the shared model is declarative data rather than markup.

### 9. Capabilities, not tiers

Some features cost a node operator real money (page storage, custom domains, animated
nameplates). Those are expressed as **capabilities** granted per node — never a `tier`,
`plan`, or `premium` field in the protocol, and never something a client branches on as a
social attribute. A self-hoster may grant everything to everyone; that's a supported
configuration, not a degraded one. Basic personal expression — a handle, a Page, a nameplate,
your data export — is never paywalled on any node. Money may buy storage and bandwidth; it
never buys social standing.

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

Two clarifications from Amendment A. _Deferred, not prohibited:_ federation now arrives at
v0.1 as a **local two-node lab**, and a node operator may later fund the node through a
supporter tier — that's node billing, invisible to the protocol (§174). _Permanently
prohibited:_ executable user code in Pages or feed definitions, in any client, and
same-origin user HTML. Deferral and prohibition are different words; don't let one drift
into the other.

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
