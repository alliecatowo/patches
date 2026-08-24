> **DRAFT.** This is a working privacy notice, written ahead of public MVP
> per `INITIAL_VISION.md` §114. It describes what the system is designed to
> store and expose today. It is not final, has not had legal review, and
> will change — treat it as an honest engineering-level statement of intent
> rather than a binding policy, until that review happens.
>
> Two kinds of statement appear below. **Status: implemented** means the
> behaviour is in the code today and was checked against it when this
> document was last revised. **Status: planned** means
> `INITIAL_VISION.md` §196–§210 (Amendment C) requires it and it does not
> exist yet. If a section carries no marker, it is implemented. Amendment C
> (§196–§210, privacy/filters/decentralized moderation) landed as of P14 —
> most of what this document used to mark "planned (Amendment C)" is now
> shipped; see each section below for what remains open.

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
- **Direct messages.** See [Direct messages](#direct-messages) — bodies are
  end-to-end encrypted on the `E2EE_V1` mode every new conversation uses;
  the node routes ciphertext and never receives a decryption key.
- Reports you file, including the free-text details, and — for a reported
  **legacy-mode** direct message (being removed; see
  [Direct messages](#direct-messages)) — a snapshot of up to 10 surrounding
  messages captured as evidence at the moment you report (§183.4). Reported
  end-to-end messages carry no such snapshot by construction: the node has no
  plaintext to snapshot, and instead verifies whatever evidence the reporter
  explicitly discloses through `ReportE2eeMessage` +
  `AttachReportEvidence`.

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

Direct messages on Patches are **end-to-end encrypted**. Every conversation carries an immutable
security mode ([ADR 0020](../decisions/0020-e2ee-direct-messages.md)), and the only mode with a
future is `E2EE_V1`: message bodies are encrypted on your device before they reach the node, and
the node stores and routes only ciphertext it cannot read — per-device envelopes addressed to
each recipient's certified keys. The words "encrypted", "end-to-end", "secure", or "private"
apply to this mode and no other (§194).

**Status: implemented** (Phase 13 + adversarial-audit hardening, ADR 0020 addendum
2026-08-24): per-device identity certificates and signed device rosters, X3DH session setup,
the full Double Ratchet with encrypted headers, franking with mandatory recipient-side
verification, encrypted reports via `ReportE2eeMessage` plus reporter-disclosed evidence (§183.4,
[ADR 0025](../decisions/0025-franking-commitment-binding.md)), and the terminal client's
send/receive runtime. The web view has **no crypto runtime**: E2EE conversations are labeled
there and open in the terminal client, which is where you read and send them.

What end-to-end encryption does not hide from the node: who messages whom, when, how much
(coarse ciphertext-size buckets), device/prekey inventory activity, and ordinary request
metadata (§8). Reports disclose exactly what a reporter explicitly selects and submits, never
more.

**Status: being removed** ([ADR 0030](../decisions/0030-pre-alpha-consolidation-policy.md),
tickets B-095/B-096). The original v0 direct-message design stored bodies in the clear and let
node operators read them, with a mandated disclosure saying so. That mode
(`LEGACY_SERVER_VISIBLE`) still exists in this pre-alpha codebase until the purge change set
lands; while any conversation remains in it, clients say "Not end-to-end encrypted — this
node's operators can read these messages" on its screen. With zero production users there is no
migration window: the plaintext machinery is deleted in the same change set that removes the
mode, and `E2EE_V1` becomes the only conversation security mode.

DMs are **not federated** — they never leave the node you sent them from, and this does not
change with encryption (§193, [ADR 0020 §13](../decisions/0020-e2ee-direct-messages.md)).
They carry no media and no link previews. A node may configure a retention window for message
records, published via `GetNodeInfo`; the reference node currently sets no window, and **no
retention sweep is implemented yet** — see
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

> **Followers-only posts and locked accounts. Status: implemented (Amendment
> C, §197.5).** By default, anyone can follow you instantly, and a
> followers-only post is visible to whoever that produces — it keeps your
> post out of public timelines and away from logged-out visitors, and that
> is all it does. If you turn on **locked** (see "Your controls" below),
> every new follow instead becomes a **request** you must accept or reject
> before that account can see your followers-only posts; nothing is visible
> to a requester until you accept. Turning `locked` on or off never changes
> who already follows you, and a pending request is never auto-accepted —
> you always decide. See
> [`architecture/social.md`](../architecture/social.md) for how this works.

> **Reading logged-out. Status: implemented (owner decision, 2026-08-19).** An invite-only
> node gates who can post an account, not who can read public content — by default, this
> node's public profiles, posts, and timelines stay visible to a logged-out visitor exactly
> like they are to a signed-in one. Node operators may close reads entirely instead (a
> "members-only" node): call `NodeService.GetNodePolicy`/`GetNodeInfo` before assuming either
> way, since a closed node answers every RPC except node discovery and sign-in with
> "sign-in required" rather than showing you anything.

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

**Status: implemented** (§197.3, §197.4, P14-010, P14-023, P14-024). `PrivacyService.ExportAccount`
requests a background job that produces a gzipped tar archive (`.tar.gz`) — `account.json`,
`posts.json`, `follows.json`, `messages.json`, your uploaded media originals under
`media/<id>.<ext>`, and a `manifest.json` listing every file with its sha256, plus an embedded
`readme` field describing the layout — matching the directory-tree-plus-media-files shape
§197.3 describes, downloadable via `GetExportStatus` for 7 days before it expires; export is
never paywalled. `RequestAccountDeletion` moves the account to "pending deletion" — it
disappears from feeds/search/the local timeline immediately — and after a grace period (30 days
by default, node-configurable) a `PURGE_ACCOUNT` job actually erases it; `CancelAccountDeletion`
restores the account intact within the grace period. The purge job's scope is posts and bodies,
media objects, follows (including pending follow requests), likes, bookmarks, reposts, community
memberships, muted tags, filter-list and labeler subscriptions, DMs sent — including every E2EE
keying artifact: identity roots, device certificates, rosters, prekeys, mailbox envelopes,
logical messages, and group-control events (reporter-disclosed evidence is deliberately exempt,
per [ADR 0020](../decisions/0020-e2ee-direct-messages.md)) — sessions, credentials, export
archives, and the notice acknowledgement.

**Status: planned.** A published, enforced retention schedule for uploaded originals, evidence
snapshots, tombstones, and general logs still does not exist — there is no DM retention sweep,
no report/evidence-snapshot expiry job, no tombstone purge, and no log-retention job in the
code, beyond the account-purge job described above.

## Your controls

Implemented today: per-post visibility (public / unlisted / followers-only),
content warnings, blocking, muting, tag muting, bookmarks (private), plain
mode, deleting your own posts and messages, and **follower approval**
("locked" accounts, Amendment C §197.5) — turn it on and every new follow
becomes a request you accept or reject, which is what makes followers-only
posts mean what people assume they mean. See
[`architecture/social.md`](../architecture/social.md).

**Status: implemented** (§197, §198–§200, P14-007 through P14-010):

- A **privacy notice acknowledgement**: `PrivacyService.AcknowledgePrivacyNotice` records that
  the notice text was shown, and `AuthService.Register` records the account's first
  acknowledgement automatically at whatever version the node currently publishes — the client
  is expected to show the notice summary before submitting registration (the TUI does this).
  `GetPrivacyPrefs` reports acknowledgement state. `REQUIRE_PRIVACY_ACK=true` (operator opt-in,
  default off) additionally gates `CreatePost` on having acknowledged the current
  `PRIVACY_NOTICE_VERSION`; DM-send and follow are the same shape of gate but not wired yet.
- **Your own filters** (`FilterService`) — up to 50 per actor, 20 literal (never regex) terms
  each: substring, whole-word, tag, author, or domain, scoped to home/local/tag/community
  feeds and search, each with a `hide`/`collapse`/`warn` action. Applied server-side at the
  same chokepoint blocks/mutes use, so every client behaves identically. `ExportFilters`/
  `ImportFilters` make them portable. Filter terms are never logged, never shown to
  moderators, and never federated.
- **Subscribable filter lists and labelers** (`FilterListService`/`LabelService`) — opt-in,
  revocable, per-entry exceptions available, and never able to create a block on your behalf
  (§199.2). A label is visible only to actors who subscribe to that labeler.
- **Operator transparency** (`NodeService.GetNodePolicy`) and an **appeals** path
  (`AppealService`) — see [`moderation.md`](moderation.md).
- §197.5's **discoverability controls** (`discoverable`/`indexable`/`show_in_local_feed` on
  `actor_privacy_prefs`, read/written via `GetPrivacyPrefs`/`UpdatePrivacyPrefs`, P14-029):
  `discoverable = false` removes the actor from `ActorService.SearchActors`
  (`GetActorByHandle`/`ResolveActor` — exact-handle resolution — still work, as required by
  §197.5, since mentions/replies/federation addressing depend on them); `indexable = false`
  excludes the actor's posts from `PostService.SearchPosts`; `show_in_local_feed = false` keeps
  the actor's still-public posts off `FeedService.ListLocalFeed` specifically — their followers'
  home feeds are unaffected. An actor with no `actor_privacy_prefs` row (registered before the
  table existed) is treated as every default: `true`.

## Operator transparency

**Status: implemented** (§197.6, P14-012, A-052). `NodeService.GetNodePolicy` (unauthenticated,
cacheable, separate from `GetNodeInfo`) publishes the node's `domain_policies` (each blocked
domain plus a bounded reason category), the label vocabulary, federation stance, account
deletion grace period and appeal window, and any operator-supplied `NODE_POLICY_URL`/
`NODE_MODERATORS`/`DATA_LOCATION`/`PRIVACY_NOTICE_VERSION`. The privacy notice's short
structured summary, the terms/community-guidelines URL, how appeals are filed, and who runs
the node are configurable too — `PRIVACY_NOTICE_SUMMARY` (or `PRIVACY_NOTICE_FILE`, which wins
when both are set, for a longer notice read from a mounted file), `TERMS_URL`,
`APPEAL_INSTRUCTIONS`, and `OPERATOR_CONTACT` populate `privacy_notice_summary`, `terms_url`,
`appeal_instructions`, and `operator_identity` respectively; all four are operator-supplied
plain text, never markup, scripts, or remote media (§197.6). Three retention windows still
have no sweep job behind them (`evidence_snapshot_retention_days`,
`uploaded_original_retention_days`, `log_retention_days`) and render honestly zero rather than
an invented value; an unset field means "this node publishes no policy" for that field, not
"there is no policy." See [`api.md`](../architecture/api.md)'s `NodeService` section for the
full field list.

`GetNodeInfo` continues to publish the node's domain, software version, registration mode, and
input limits — the two RPCs are deliberately separate (§197.6).

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
