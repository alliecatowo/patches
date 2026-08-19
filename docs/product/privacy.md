> **DRAFT.** This is a working privacy notice, written ahead of public MVP
> per `INITIAL_VISION.md` §114. It describes what the system is designed to
> store and expose today. It is not final, has not had legal review, and
> will change — treat it as an honest engineering-level statement of intent
> rather than a binding policy, until that review happens.
>
> Two kinds of statement appear below. **Status: implemented** means the
> behaviour is in the code today and was checked against it when this
> document was last revised. **Status: planned (Amendment C)** means
> `INITIAL_VISION.md` §196–§210 requires it and it does not exist yet. If a
> section carries no marker, it is implemented.

# Privacy Notice (Draft)

Patches is small, chronological, and not built around tracking you for
advertising. This document explains, plainly, what we store about you, what's
public, how long things stick around, and what will change once federation
is turned on.

A Patches **node** is a deployment of this software (`INITIAL_VISION.md`
§163). This notice describes what the software stores and exposes. The
operator of whichever node you use is the party actually holding that data,
and a self-hosted node's operator may configure retention differently — see
[Operator transparency](#operator-transparency).

## What we store

**Account information:**

- Your email address, and a normalized version of it used to enforce
  uniqueness (so `You@Example.com` and `you@example.com` are recognized as
  the same account).
- Whether your email has been verified, and when.
- A **hashed** password — never the password itself. Passwords are never
  logged, anywhere, under any circumstance.
- Any other credentials you enrol: SSH public keys, and a stable provider
  account identifier for a linked GitHub credential. We never store an SSH
  **private** key, and we do not persist third-party OAuth access or refresh
  tokens (`INITIAL_VISION.md` §165–§167, §177).
- Account status (active, suspended, deleted) and timestamps for account
  creation, last update, and — if applicable — deletion.

**Profile information (what you choose to share):**

- Avatar, display name, `@handle`, bio, optional location text, optional
  personal URL, and your join date.
- Your nameplate and flair, if you set them — cosmetic presentation data,
  no images, no uploads (§173, §184).
- Your Patches Page document, if you have one, and its revision history.

**Content:**

- Posts and replies you create — text, and any image media you attach.
- Edits: when you edit a post we keep the **previous** version (body,
  content warning, media manifest) in an edit-history record, and that
  history is visible to anyone who can see the post (§186.1). Editing is
  not a way to un-say something.
- Uploaded images. When we generate the display and thumbnail versions that
  get served to other people, **EXIF metadata is stripped** — GPS
  coordinates, camera/device model, and camera timestamps are not present
  in what we serve. Orientation is normalized and the tag dropped.
  **Your original upload is retained in object storage, with its metadata
  intact.** It is not served to normal clients, but it is not deleted after
  processing either. See [Retention and deletion](#retention-and-deletion) —
  this is a known gap, not a design.
- Your social graph: who you follow, who follows you, who you've blocked
  or muted, and which tags you've muted.
- Likes, bookmarks, and reposts — including which posts you've liked, so we
  can show you your own reaction. Bookmarks are private to you.
- Communities you belong to, and your role in them.
- **Direct messages.** See [Direct messages](#direct-messages) — they are
  stored in the clear and the node's operators can read them.
- Reports you file, including the free-text details, and — for a reported
  direct message — a snapshot of up to 10 surrounding messages captured as
  evidence at the moment you report (§183.4).

**Operational logs:**

- Structured request logs including a **request ID**, timestamp, the gRPC
  method called, latency, outcome, and actor/user IDs where relevant to
  the operation.
- We do **not** log passwords, access tokens, refresh tokens, verification
  or password-reset codes, raw authorization headers, or **direct message
  bodies** (§192, §194). If you ever see one of these in a log, that's a
  bug — please report it per [`SECURITY.md`](../../SECURITY.md).

**What we don't do:**

- No ad tracking. There are no ads.
- No third-party analytics trackers embedded in the client.
- No engagement/attention-optimization telemetry (view counts, impression
  tracking, time-on-post, etc.) — this isn't a policy afterthought, it's a
  direct consequence of the product's [core principles](principles.md):
  the server isn't in the business of measuring what captures your
  attention.
- No votes, karma, scores, or reputation of any kind, and nothing that
  ranks your timeline (§194). There is no number attached to you.

## Direct messages

**Direct messages are not end-to-end encrypted. The operators of the node
hosting them can read them.** This is stated in the product itself, on the
messages screen, and it is deliberate: a node that cannot read a report's
evidence cannot act on harassment (§183.1, §183.4, and
[ADR 0017](../decisions/0017-server-visible-dms.md)).

Concretely: message bodies are stored in PostgreSQL in the clear, protected
by TLS in transit, the provider's disk encryption at rest, and access
control — the same protection as every other row in the database, and no
more. "Direct" is the honest word for them; "private", "secure", and
"encrypted" are not, and no Patches client or document is permitted to use
those words about v0 DMs (§194).

DMs are **not federated** — they never leave the node you sent them from
(§193). They carry no media and no link previews. A node may configure a
retention window that deletes old messages, published via `GetNodeInfo` so
clients can state it truthfully; the reference node currently sets no
window, and **no retention sweep is implemented yet** — see
[Retention and deletion](#retention-and-deletion).

## What's public

By default:

- Your profile (avatar, display name, handle, bio, location text,
  personal URL, join date, nameplate, flair) is visible to anyone with
  access to the node.
- Posts you create are public to the node unless you set a different
  visibility. Three visibilities exist today: **public**, **unlisted**
  (excluded from public timelines and tag feeds), and **followers-only**.
- Your follows/followers lists, and aggregate like/repost counts on your
  posts, are visible.
- Your Patches Page, if it is set to public.

> **Read this if you use followers-only posts. Status: known limitation.**
> Anyone can follow you instantly — there is no follow approval yet — so a
> followers-only post is one button-press away from being readable by any
> account on the node. It keeps your post out of public timelines and away
> from logged-out visitors, and that is all it currently does. Follower
> approval ("locked" accounts) is required by Amendment C (§197.5) and is
> not built yet. Until it ships, treat followers-only as "quieter", not as
> "private".

Not public:

- Your email address, whether verified or not.
- Your password hash and credential secrets (obviously — but stated for
  completeness). A credential secret hash is never returned over the API
  (§177).
- Reports you've filed or that have been filed against you, and any
  moderator notes — these are visible only to moderators. See
  [`moderation.md`](moderation.md).
- Raw operational logs.
- Blocks and mutes you've placed are not disclosed to the blocked/muted
  party, and the API deliberately has no way to ask "does this person block
  me?" (§62).
- Your bookmarks, your muted tags, and your direct messages.

## Retention and deletion

Honest current state:

- Deleting a post uses **soft deletion (tombstoning)**, not immediate
  destruction of the row. A deleted post shows as `[deleted]` to other
  users, and its original body/media stop being served to normal clients
  — but the underlying record is retained for thread integrity,
  moderation review, and (later) federation delete propagation.
- **Deleting an account is operator-initiated today.** There is no
  self-service account deletion in any client. An operator running
  `patches-admin user delete <handle>` marks the user and actor deleted;
  it does **not** erase or purge content, and there is no purge job.
- **Uploaded originals are kept.** An upload that is never finalized is
  cleaned up when it expires, but once media is processed successfully the
  original file — metadata included — stays in object storage indefinitely.
  The previous version of this document claimed originals were "deleted or
  quarantined after processing". That was wrong, and it is corrected here.
- **No numeric retention schedule is enforced anywhere.** There is no DM
  retention sweep, no report/evidence-snapshot expiry, no tombstone purge,
  and no log-retention job in the code. Where this document previously
  implied "a separate, more permanent retention policy" existed, it did
  not.

**Status: planned (Amendment C).** §197.3 and §197.4 require, and §204 sets
limits for:

- **Account data export** — request an archive of your account (profile,
  posts, edit history, social graph, likes/bookmarks, communities, DMs,
  filters, your published lists, and your media), produced by a background
  job and downloaded directly from object storage. Export may never be
  paywalled (§177, §174).
- **Self-service account deletion with a grace period** — you request
  deletion, the account stops appearing anywhere immediately, and after a
  published grace period (30 days by default, node-configurable) a purge
  job actually erases it. You can cancel during the grace period.
- **A published retention schedule** for uploaded originals, evidence
  snapshots, tombstones, and logs — with jobs that actually enforce it,
  rather than prose that describes an intention.

## Your controls

Implemented today: per-post visibility (public / unlisted / followers-only),
content warnings, blocking, muting, tag muting, bookmarks (private),
plain mode, and deleting your own posts and messages.

**Status: planned (Amendment C).** §197 and §198–§200 add:

- A **privacy notice shown before you finish registering**, summarizing this
  document in the client itself — including, in plain words, that this
  node's operators can read your DMs — plus an in-app `privacy` screen and
  `patches privacy` command that show the same thing at any time.
- **Discoverability controls**: opt out of appearing in actor search and any
  node directory; opt out of full-text post search indexing; opt out of the
  local timeline while still posting publicly.
- **Follower approval** ("locked" accounts), which is what makes
  followers-only posts mean what people assume they mean.
- **Your own filters** — keyword, phrase, tag, author, and link-domain
  filters that hide or collapse matching posts, applied by the server so
  every client you use behaves identically. Filter terms are treated as
  sensitive: they are never logged, never shown to moderators, never
  federated, included in your export, and deleted with your account
  (§206).
- **Subscribable filter lists and labelers** — opt-in, revocable, and
  never able to block on your behalf (§199.2).
- **Operator transparency** and an **appeals** path — see
  [`moderation.md`](moderation.md).

## Operator transparency

**Status: planned (Amendment C, §197.6.)** A node will publish, through
`NodeService.GetNodePolicy` and a client screen, the things you need in
order to decide whether to trust it: where its policy documents live, who
its moderators are or how to reach them, its federation stance and the
domains it blocks or limits, where the data physically lives, its retention
windows, and its appeal contact.

Today, none of that is exposed through the API. `GetNodeInfo` publishes the
node's domain, software version, registration mode, and input limits only.

## Future federation exposure

Federation exists in the code behind a gateway seam and is **disabled by
default** on every node (§163). No content leaves the reference node today.
When ActivityPub federation is enabled, the trust and privacy model changes
in ways worth stating clearly now:

- **Public posts and public profile fields will be sent to other,
  independently-operated servers** that follow your account or otherwise
  legitimately receive that content, and from there are outside our
  control — a remote server may retain, display, or handle that data
  according to its own policies, not ours.
- **Actor identity (your handle and node) becomes visible across the
  fediverse** the moment you're discoverable, similar to how any
  ActivityPub/Mastodon-style account works today.
- Deletes will be propagated as federation `Delete` activities, but — as
  with the rest of the fediverse — we cannot guarantee a remote server
  actually removes a copy it has already fetched.
  ActivityStreams itself flags that social activity data can carry
  sensitive personal information and implementers should be upfront about
  what's collected and shared; we're taking that seriously rather than
  treating it as boilerplate.
- **Direct messages are not federated** and Amendment C does not change
  that (§193, §194). Federated DMs need their own security decision and
  owner sign-off (§195.6).
- **Your filters are never federated** (§208). What you have chosen not to
  see is nobody else's business, least of all a remote server's.
- A **filter list you publish** is public by construction — that is what
  publishing means — and is the one moderation artifact intended to
  federate later (§199.4). Subscriptions to it are not public (§208).

Before federation is exposed to the public Internet, this section will be
expanded with concrete specifics about exactly which fields federate, what's
cached from remote servers, and how blocks/mutes/filters interact with a
remote node. Every §109 control is a hard gate before that happens.

## Questions

This is a draft. If something here is unclear, seems wrong, or you want to
know something it doesn't answer, reach out via the contact in
[`SECURITY.md`](../../SECURITY.md) or open an issue.
