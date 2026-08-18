> **DRAFT.** This is a working privacy notice, written ahead of public MVP
> per `INITIAL_VISION.md` §114. It describes what the system is designed to
> store and expose today. It is not final, has not had legal review, and
> will change — treat it as an honest engineering-level statement of intent
> rather than a binding policy, until that review happens.

# Privacy Notice (Draft)

Patches is small, chronological, and not built around tracking you for
advertising. This document explains, plainly, what we store about you, what's
public, how long things stick around, and what will change once federation
is turned on.

## What we store

**Account information:**

- Your email address, and a normalized version of it used to enforce
  uniqueness (so `You@Example.com` and `you@example.com` are recognized as
  the same account).
- Whether your email has been verified, and when.
- A **hashed** password — never the password itself. Passwords are never
  logged, anywhere, under any circumstance.
- Account status (active, suspended, deleted) and timestamps for account
  creation, last update, and — if applicable — deletion.

**Profile information (what you choose to share):**

- Avatar, display name, `@handle`, bio, optional location text, optional
  personal URL, and your join date.

**Content:**

- Posts and replies you create — text, and any image media you attach.
- Uploaded images. During processing, we strip **EXIF metadata** (this
  includes things like GPS coordinates, camera/device model, and
  timestamps embedded by your camera or phone) before an image is served
  back out. We also normalize orientation and generate display/thumbnail
  derivatives; the original upload is deleted or quarantined per internal
  retention policy after processing, not kept around indefinitely for no
  reason.
- Your social graph: who you follow, who follows you, who you've blocked
  or muted.
- Likes/favorites, if and when that feature is enabled — including which
  posts you've liked, so we can show you your own reaction, even though
  aggregate counts are the only thing shown publicly.

**Operational logs:**

- Structured request logs including a **request ID**, timestamp, the gRPC
  method called, latency, outcome, and actor/user IDs where relevant to
  the operation.
- We do **not** log passwords, access tokens, refresh tokens, verification
  or password-reset codes, or raw authorization headers. If you ever see
  one of these in a log, that's a bug — please report it per
  [`SECURITY.md`](../../SECURITY.md).

**What we don't do:**

- No ad tracking. There are no ads.
- No third-party analytics trackers embedded in the client.
- No engagement/attention-optimization telemetry (view counts, impression
  tracking, time-on-post, etc.) — this isn't a policy afterthought, it's a
  direct consequence of the product's [core principles](principles.md):
  the server isn't in the business of measuring what captures your
  attention.

## What's public

By default:

- Your profile (avatar, display name, handle, bio, location text,
  personal URL, join date) is visible to anyone with access to the
  instance.
- Posts you create are public to the instance unless a future
  visibility/follower-only feature says otherwise (not yet implemented —
  see [Future federation exposure](#future-federation-exposure)).
- Your follows/followers lists and aggregate like counts on your posts are
  visible.

Not public:

- Your email address, whether verified or not.
- Your password hash (obviously — but stated for completeness).
- Reports you've filed or that have been filed against you, and any
  moderator notes — these are visible only to moderators. See
  [`moderation.md`](moderation.md).
- Raw operational logs.
- Blocks and mutes you've placed are not disclosed to the blocked/muted
  party.

## Retention and deletion

- Deleting a post uses **soft deletion (tombstoning)**, not immediate
  destruction of the row. A deleted post shows as `[deleted]` to other
  users, and its original body/media stop being served to normal clients
  — but the underlying record is retained briefly for thread integrity,
  moderation review, and (later) federation delete propagation, before
  being subject to a separate, more permanent retention policy.
- Deleting an account marks it `DELETED` and follows a similar
  soft-deletion path rather than instantaneous erasure, for the same
  reasons (thread integrity, abuse investigation window, moderation
  audit trail).
- Uploaded media originals are deleted or quarantined after processing
  derivatives are generated, per internal policy — we don't keep raw
  uploads around forever "just in case."
- A concrete, numeric retention schedule (exactly how long a tombstoned
  post or deleted account's data persists before permanent purge) is not
  yet finalized. This section will be updated with specifics before
  public MVP.

## Future federation exposure

Patches does not federate yet (see `INITIAL_VISION.md` §105–110 for the
architectural plan). When ActivityPub federation is enabled, the trust and
privacy model changes in ways worth stating clearly now:

- **Public posts and public profile fields will be sent to other,
  independently-operated servers** that follow your account or otherwise
  legitimately receive that content, and from there are outside our
  control — a remote server may retain, display, or handle that data
  according to its own policies, not ours.
- **Actor identity (your handle and instance) becomes visible across the
  fediverse** the moment you're discoverable, similar to how any
  ActivityPub/Mastodon-style account works today.
- Deletes will be propagated as federation `Delete` activities, but — as
  with the rest of the fediverse — we cannot guarantee a remote server
  actually honors and removes a copy it has already fetched.
  ActivityStreams itself flags that social activity data can carry
  sensitive personal information and implementers should be upfront about
  what's collected and shared; we're taking that seriously rather than
  treating it as boilerplate.
- Direct messages are explicitly out of scope for the current product (see
  §5 non-goals) and are not part of this federation plan.

Before federation ships (even in its two-instance lab stage), this section
will be expanded with concrete specifics about exactly which fields
federate, what's cached from remote servers, and how blocks/mutes interact
with a remote instance.

## Questions

This is a draft. If something here is unclear, seems wrong, or you want to
know something it doesn't answer, reach out via the contact in
[`SECURITY.md`](../../SECURITY.md) or open an issue.
