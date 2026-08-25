# Social graph and Amendment B social depth

Status: implemented. Spec: `INITIAL_VISION.md` §50, §61–63 (follows), Amendment B §178–§195
(reposts/quotes, tags, communities, DMs, flair/pins, quiet feed, edit history), Amendment C
§197.5 (follow requests).

This document covers the social-graph primitive (follows) and every Amendment B feature. RPC
signatures and status markers live in [`api.md`](./api.md) — this doc is about behavior, not
the wire contract.

## Follows

A `follows` row (`packages/database/src/entities/follow.entity.ts`) is the only representation
of "A follows B" — there is no `NONE` status; the absence of a row **is** `NONE`. A v0 local
account transitions straight to `FOLLOWING` (spec §50). Following a **remote** actor
(P8-002/P8-003) instead creates a row with `status = 'PENDING'` until that actor's own node
sends back an `Accept` activity, at which point `InboxService` flips it to `FOLLOWING`.

### Followers and following lists

Followers and following lists are served via `ActorService.ListFollowers` and `ActorService.ListFollowing` (keyset-paginated on `(created_at DESC, id DESC)`). Both clients provide full list screens:

- **TUI**: `ProfileScreen` displays total counts and binds `F` (view followers) and `G` (view following), navigating to `ActorListScreen.tsx`. Signed-in users can also use `:followers` and `:following` in the command palette.
- **Web**: `ProfileRoute.tsx` provides dedicated `Followers` and `Following` tabs, selectable via tab buttons or count pills (`# followers` / `# following`), rendering actor cards through `ActorList.tsx`.

## Locked accounts and follow requests (§197.5)

`actor_privacy_prefs.locked` (default `false`, owned by `PrivacyService`,
`packages/database/src/entities/actor-privacy-prefs.entity.ts`) is a correctness fix, not a
cosmetic control: `POST_VISIBILITY_FOLLOWERS` is enforced by a `follows` row lookup, and before
this feature shipped `FollowActor` created that row with no approval step at all — so a
followers-only post was one RPC call away from readable by any account on the node.

When `FollowActor`'s target is a **locked local actor**, the call creates a pending row in its
own `follow_requests` table (`packages/database/src/entities/follow-request.entity.ts`)
instead of a `follows` row, and `FollowActorResponse.requested` comes back `true`. This is
deliberately a separate table from `follows.status = 'PENDING'`, not a third value reusing that
column: the remote-federation `PENDING` state above means "waiting on another server's
`Accept`", while a locked-account request means "waiting on a human's approval" — two unrelated
processes that would otherwise race the same row for two different reasons. `Relationship.state`
still reports `FOLLOW_STATE_PENDING` for both cases (a client showing "follow state" doesn't
need to care which), but `Relationship.requested`/`requested_by` disambiguate the locked-account
case specifically:

- `requested` — the caller has a pending outgoing request toward the target.
- `requested_by` — the target has a pending incoming request toward the caller (only meaningful
  when the caller's own account is locked).

### Lifecycle

- **Create** — `FollowActor` against a locked local actor: block-aware (rejects with
  `ACTOR_BLOCKED` exactly like an ordinary follow), rate-limited per actor and per peer
  (`GraphService`'s `FollowRequestRateLimitService`, database-backed via the shared
  `DbRateLimitStore`/`enforceWindowRateLimit` helpers — 20/hour and 100/day per actor, 5x that
  per peer), and idempotent (calling again while a request is already pending returns the same
  outstanding result, not a second row or a second notification). Writes a `FOLLOW_REQUEST`
  notification to the target.
- **List** — `ListFollowRequests`: the caller's own inbound queue only, keyset-paginated on
  `(created_at DESC, id DESC)` (spec §46). There is no `actor_id` parameter — a caller can only
  ever see their own request queue.
- **Accept** — `AcceptFollowRequest(actor_id)`: creates the `FOLLOWING` `follows` row and
  deletes the request row in the same transaction. `FOLLOW_REQUEST_NOT_FOUND` if none is
  pending. Writes a `FOLLOW` notification **to the requester** (not the accepting actor) — "your
  request was accepted", reusing the existing `FOLLOW` notification type rather than adding a
  new one purely for this. Clients rendering `FOLLOW` notifications should be aware a recipient
  can receive one either because someone followed them directly, or because their own request
  was just accepted; the `Notification.actor` is the locked account in the latter case.
- **Reject** — `RejectFollowRequest(actor_id)`: deletes the request row, never creates a
  `follows` row. `FOLLOW_REQUEST_NOT_FOUND` if none is pending. Deliberately does **not** notify
  the requester — same non-disclosure reasoning §62 already applies to blocks (telling someone
  they were specifically declined has no legitimate use a silent absence doesn't already serve,
  and is a plausible harassment vector).
- **Cancel** — there is no separate "cancel my request" RPC: `UnfollowActor` also deletes any
  pending outgoing request toward the target, in addition to its existing `follows`-row delete.
  A client's "unfollow" and "cancel request" UI affordances can call the same RPC.
- **Unlocking never auto-accepts** — flipping `actor_privacy_prefs.locked` back to `false` does
  not touch any row in `follow_requests`. A request stays pending until explicitly accepted or
  rejected, or cancelled by the requester, regardless of the target's current `locked` value.
  Existing followers acquired while the account was locked are unaffected either way — nothing
  in this feature ever removes a `follows` row on a lock/unlock transition.

### What a client must add

- Show `requested`/`requested_by` somewhere in a profile/relationship view — "follow requested"
  vs. "follow" vs. "following" vs. (for the target) "wants to follow you".
- A request-queue screen backed by `ListFollowRequests`/`AcceptFollowRequest`/
  `RejectFollowRequest`.
- Handle `FOLLOW_REQUEST`-type notifications (new to the client), and be aware that a
  `FOLLOW`-type notification may now mean "your request was accepted" rather than "you gained a
  follower" — the `Notification.actor` field is the only signal available to tell them apart
  (it is the locked account either way, but in the "accepted" case the true directionality is
  the recipient following that actor, not the other way around).
- `FOLLOWERS`-visibility posts may now be described honestly as private to accepted followers,
  not merely "not shown publicly" (see `docs/product/privacy.md`).

## Reposts and quotes (§180)

A **repost** (`ReactionService.RepostPost`/`UnrepostPost`/`ListPostReposters`,
`apps/server/src/modules/reactions/reaction.service.ts`) is a pointer row — `(actor, post,
created_at)` — never a row in `posts`, and never resolves to another repost (reposting a
repost reposts the underlying original). It carries no body/media/content-warning and enters a
feed at its own `created_at`; it never changes the original post's position. Ineligible
targets (`FOLLOWERS`-visibility post that isn't the reposter's own, a tombstoned post, or an
author who blocks the reposter) are rejected; unlisted posts are repostable. Deleting the
original tombstones every repost of it. `FeedService`'s home-feed read collapses a post
reachable more than once within a single page (original plus reposts) to one entry, naming up
to three reposters — deliberately per-page only, not cross-page (§180.1's documented
trade-off, keyset pagination makes cross-page dedup expensive).

A **quote** is an ordinary `posts` row with `quoted_post_id` set and its own body/media — a
client MUST offer a repost instead of letting an author create an empty quote. Every post
carries `quote_policy` (`ANYONE`/`FOLLOWERS`/`NOBODY`, default `ANYONE`), enforced server-side
in `PostService.createPost` (`apps/server/src/modules/posts/post.service.ts`): a `NOBODY`
quote target rejects everyone but the author, a `FOLLOWERS` target rejects non-followers, and
an author who blocks the quoting actor rejects regardless of policy. A deleted quoted post
renders as a tombstoned embed; the quoting post's own body survives. Rendering nests exactly
one level (a quote of a quote shows the inner quote as a link, never recursively) — a client
concern, not a server one. `PostCounts.reposts`/`.quotes` and `PostViewerState.reposted` are
real counts/flags, displayed only, never used to order anything.

## Editing with history, deletion (§186.1–186.2)

`PostService.editPost`/`ListPostEdits` (`post.service.ts`) may change body, content warning,
media set/order, and alt text; `post_type`, `visibility`, `in_reply_to_id`, `community_id`,
`quoted_post_id`, and `created_at` are immutable after creation. Every edit snapshots the
**previous** state into a `post_edits` row before applying the new one, capped at
`MAX_POST_EDITS_PER_POST` (`@patches/domain`); `edited_at` is set, `created_at` untouched, and
an edit never re-orders the post in any feed. `ListPostEdits` stops serving rows once the post
is deleted (deletion tombstones the edit history with it). Deletion itself remains the
existing soft-delete tombstone (§25), reachable from the client with a confirmation.

## Pinned posts (§184.1)

`PostService.pinPost`/`unpinPost` manage an actor's own ordered `pinned_post_ids` (on `Actor`),
capped at `MAX_PINNED_POSTS` (three). Only the actor's own `PUBLIC`/`UNLISTED` posts are
pinnable — a `FOLLOWERS` post can't be pinned, since pinning surfaces it on the public profile
wall regardless of the viewer's follow state. Pinning never affects feed ordering; it is a
profile/wall arrangement only.

## Tags (§181)

Written inline as `#tag` in a post body; extraction happens server-side at write time into a
relation table (`packages/database/src/entities/tag.entity.ts` and the post-tag join), never
on a feed's read path, and never fails the post if extraction itself fails. `tags.name` is
NFKC-normalized and case-folded (the post preserves the author's original casing for display);
grammar is letters/digits/`_` after `#`, ≤ 30 chars, at least one letter (an all-digit tag is
rejected), at most 10 tags per post (an eleventh is `INVALID_ARGUMENT`, not silent truncation).
`TagService.SearchTags` returns up to 20 normalized-prefix matches in alphabetical order —
never by popularity or recency; there is no `post_count` column anywhere, deliberately, so a
future "sort by popularity" has nothing to read. `FeedService.ListTagFeed` is `PUBLIC`-only,
chronological, keyset-paginated, block/mute-aware, and excludes community posts the viewer
isn't a member of. `TagService.MuteTag`/`UnmuteTag`/`ListMutedTags` manage a viewer's private
tag filters (home/local/tag-timeline discovery only — a thread the viewer opened directly
still renders in full, the §63 mute model applied to tags).

## Communities (§182)

`CommunityService` (`apps/server/src/modules/communities/community.controller.ts`) implements
create/get/list/search, join/leave, membership listing, update, moderator-role assignment,
post removal from the community, bans, and invites. A community's name is `[a-z0-9_]{3,32}`,
unique per node, drawn against a reserved-name blocklist, addressed `+name` locally. A post
carries at most one `community_id`, set at creation and immutable — cross-posting copies the
post rather than sharing a row. `ListCommunityFeed` is strictly chronological, keyset-paginated,
with no ordering parameter. The home feed is unchanged (follows-only; a community post reaches
a follower's home feed like any other post from that author); the local feed excludes
community posts unless the viewer is a member. The creator is the first moderator; moderators
may appoint/remove other moderators (never the creator), remove a post from the community
(the post survives on the author's own profile with `community_id` cleared, and the removal is
audit-logged), and ban an actor from the community. Community moderation is scoped to that
community only — it cannot suspend an account or reach any other community; node moderators
outrank community moderators everywhere. Invites are pointers, not auto-joins: one pending
invite per `(community, actor)`, producing a `COMMUNITY_INVITE` notification the invitee
accepts (`RespondToCommunityInvite`) or ignores.

## Direct messages (§183, §194; ADR 0020, ADR 0030/B-095) — end-to-end encrypted

**Every DM conversation is `CONVERSATION_SECURITY_MODE_E2EE_V1`.** ADR 0017's server-visible,
plaintext mode (`CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE`) is retired: its enum value
is reserved and never reissued, and ADR 0030/B-095 deleted `DirectMessageService`'s plaintext
send/read/delete RPCs and the message-request flow in the same change set. The node routes,
authorizes, rate-limits, and retains opaque ciphertext bytes — it never receives a message
body, a message key, or ratchet/device key state (`packages/proto/proto/patches/v1/e2ee.proto`).
Every client must display, on the messages screen itself, the disclosure
`requiredConversationDisclosure('E2EE_V1')` (`@patches/domain`): "End-to-end encrypted. This
node cannot read these messages, but it can see who you message and when." The metadata clause
is not throat-clearing — the node still sees who messages whom and when, and no client may
imply otherwise (§194). See `docs/architecture/e2ee.md` for the full protocol.

`MessagesService`/`MessagesController` (`apps/server/src/modules/messages/`) still exists but
now serves only the content-free surface: `ListConversations`, `GetConversation`,
`LeaveConversation`, `MarkConversationRead`. First-contact gating moved into
`mayMessageDirectly` (`direct-message-eligibility.ts`), shared by the E2EE module's
`CreateE2eeConversation`/`AddE2eeMember`: an actor may open a conversation only with a mutual
follow. §183.2's second arm — "or the target accepted a prior message request" — has no
backing store any more (the `message_requests` flow was deleted with the plaintext machinery);
mutual follow is the only path to first contact until an E2EE-native request flow is designed.
Blocking bars contact in either direction and reveals nothing to the blocked party (§62's
no-oracle rule). Groups cap at 8 members; an actor cannot be added to a group with someone who
has blocked them or whom they have blocked. There are no read receipts and no typing
indicators. Unread state is per-viewer; delivery is poll-based, no push infra.
`E2eeService.AttachReportEvidence` is the one deliberate exception to "the node never sees a
body": a reporter explicitly selects and submits plaintext as evidence, retained for the
lifetime of the report and no longer. DMs are not federated in v0 (ADR 0020 §13, unchanged).

DMs are **terminal-client-only in v0**: web and mobile have no crypto runtime and cannot start
or read a conversation. The web profile "Message" button (`apps/web/src/components/DmNotice.tsx`)
toasts an honest refusal rather than degrading into a broken or misleading affordance; mobile
has no DM surface at all.

**Retention honesty (B-061)**: `DM_RETENTION_DAYS` defaults to and publishes `0` (indefinite retention), matching the actual operational behavior where no server-side background deletion job exists. Nonzero configuration is rejected at startup until a verified deletion worker job is implemented.

## Flair, pinned posts, and quiet feed (§184–§185)

`ActorFlair` (`Actor.flair`, validated in `apps/server/src/modules/actors/flair-validation.ts`
and exercised by `flair-validation.test.ts`) is a bounded (≤ 1 KiB) document: `post_accent`,
`border_style`, `like_glyph` (one codepoint from the node's `GetNodeInfo`-published allow-list
— no images/uploads/custom emoji/ZWJ/combining marks/control characters), `wall_theme`, and
`pinned_post_ids`. `ActorService.UpdateProfile`'s field mask includes `flair`;
`UpdateProfile`'s mapper (`actor.mapper.ts`) enforces contrast-floor and legibility rules the
same way nameplates already do (§173) — flair is presentation, never required to read a post
or find a control, and it must never move a cursor, open a scroll region, or clear the screen.
A custom `like_glyph` changes only how the **viewer's own like** renders; there is exactly one
reaction (the like), no per-glyph counts, no reaction breakdowns.

**Plain mode** (`P`, `PATCHES_PLAIN=1`) strips all decoration including the viewer's own.
**Quiet feed** is a distinct, TUI-local preference (`apps/tui/src/preferences/store.ts`'s
`quietFeed` field, wired through `App.tsx`) that hides _other actors'_ cosmetics while keeping
the viewer's own identity and the client's structural colors (selection, focus, errors) intact.
Quiet feed is client-only — the server has no field for it and must never gate on it (§185,
presentation is the client's job). The two controls compose, with plain mode winning where
they overlap. Neither control ever hides content: content warnings, alt text, tombstones, and
moderation notices always render.

## Reaching every client

`docs/user-guide.md` documents the TUI keys for reposting/quoting, editing, pinning, tags,
communities, DMs, flair, and quiet feed (§191) — the `?` help screen is generated from
`apps/tui/src/app/keymap.ts`, the source of truth `apps/tui/test/docs-keymap.test.ts` enforces
stays in sync with this doc.
