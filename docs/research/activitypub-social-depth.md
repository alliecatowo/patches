# ActivityPub mapping for Amendment B social depth — Reference

> **None of this is in Phase 11 scope.** Amendment B ships reposts, quotes, tags,
> communities and DMs as **local, single-node** features (`INITIAL_VISION.md` §180–§183).
> This note exists so the local data model does not paint federation into a corner (§193).
> It moves **no** §109 security gate and **no** §160 federation-readiness checklist item, and
> it authorizes no code. DM federation in particular is a **hard prohibition** in v0 (§194)
> and needs its own owner sign-off (§195.6).

Verified **2026-08-18** against, in order of authority:

1. W3C Recommendations — <https://www.w3.org/TR/activitypub/>,
   <https://www.w3.org/TR/activitystreams-vocabulary/>
2. W3C SocialCG extension registry — <https://www.w3.org/wiki/Activity_Streams_extensions>
3. Fediverse Enhancement Proposals — FEP-044f, FEP-1b12 (Codeberg `fediverse/fep`)
4. Implementation documentation — Mastodon (`docs.joinmastodon.org`,
   `blog.joinmastodon.org`), Lemmy (`join-lemmy.org`), Mbin (`docs.joinmbin.org`)

Claims are labelled: unlabelled = quoted or paraphrased from the cited source;
`inferred:` = our reasoning from cited facts; `unverified:` = we could not confirm it from a
primary source and it must be re-checked before any implementation.

This note complements `docs/research/activitypub.md` (core F1 protocol reference) and is
summarized, without detail, in `docs/architecture/federation.md` §7.6.

---

## 1. Reposts — `Announce` / `Undo(Announce)`

Source: <https://www.w3.org/TR/activitystreams-vocabulary/> §3.1 (accessed 2026-08-18).

- `Announce` "Indicates that the `actor` is calling the `target`'s attention the `object`."
  (spec wording verbatim, typo included). It extends `Activity`; "The `origin` typically has
  no defined meaning."
- `Undo` "Indicates that the `actor` is undoing the `object`. In most cases, the `object`
  will be an `Activity` describing some previously performed action". The vocabulary places
  **no formal type restriction** on what may be undone — the "must be an Activity" rule is
  convention, not normative text.

**How Mastodon renders it.** Source: <https://docs.joinmastodon.org/spec/activitypub/>
(accessed 2026-08-18). `Announce` is "Transformed into a boost on a status"; `Undo` is used
to "Undo a previous Like or Announce."

**Friction with the Patches model (§180.1).**

- Patches calls this a **repost**, never a "boost", and the word `boost` is banned in UI and
  code. That is a local vocabulary rule; the wire word is `Announce` either way, so the ban
  costs nothing at the protocol boundary.
- §180.1 requires that a repost **never move, bump or re-sort** the original post. Over
  federation this rule is only enforceable on **our** timelines. `inferred:` a Mastodon
  server receiving our `Announce` will place the boosted post in its followers' timelines by
  its own rules, and we cannot constrain that. This is a rendering difference on a remote
  node, not a violation of §180.1 on ours — say so plainly rather than pretending the rule
  federates.
- A repost is not a `posts` row locally (§180.1), so the outbound mapping is
  `repost row → Announce{actor, object: <post URI>}` and `unrepost → Undo{object: <the
original Announce>}`. `inferred:` this means the `Announce` activity id must be **stable
  and reconstructible** from the repost row (or stored), or `Undo` cannot name its object.
  That is the one thing the local schema has to get right now; everything else can wait.
- §180.1's eligibility rules (no reposting `FOLLOWERS`-visibility posts you do not own, no
  reposting when blocked) must be re-checked on **inbound** `Announce` too — §193's "remote
  reposts MUST NOT bypass local block, mute, or domain-block rules".

---

## 2. Quotes — FEP-044f, and the three legacy properties

Source: <https://codeberg.org/fediverse/fep/src/branch/main/fep/044f/fep-044f.md>
(accessed 2026-08-18). **Status: DRAFT**, received 2025-04-03. Draft status matters: this is
the direction of travel, not a stable contract.

Properties it defines:

| Property             | URI                                                          |
| -------------------- | ------------------------------------------------------------ |
| `quote`              | `https://w3id.org/fep/044f#quote`                            |
| `quoteAuthorization` | `https://w3id.org/fep/044f#quoteAuthorization`               |
| `QuoteAuthorization` | `https://w3id.org/fep/044f#QuoteAuthorization` (object type) |
| `interactionPolicy`  | `https://gotosocial.org/ns#interactionPolicy`                |
| `canQuote`           | `https://gotosocial.org/ns#canQuote`                         |

Consent model: the quoted post's author issues a `QuoteAuthorization` object via an `Accept`
activity. It carries `interactingObject` (the quote post), `interactionTarget` (the quoted
object) and `attributedTo` (the quoted author). The quoting post references it through
`quoteAuthorization` — i.e. **authorization is a stamp the quoted side issues**, not a claim
the quoting side makes.

Legacy properties the FEP itself acknowledges and suggests emitting "as fallback for
compatibility", while noting each has drawbacks:

| Property         | URI                                          | Origin            |
| ---------------- | -------------------------------------------- | ----------------- |
| `_misskey_quote` | `https://misskey-hub.net/ns/#_misskey_quote` | Misskey           |
| `quoteUrl`       | `as:quoteUrl`                                | de facto / AS2 ns |
| `quoteUri`       | `http://fedibird.com/ns#quoteUri`            | Fedibird          |

(FEP-e232's "link object" approach is a fourth alternative the FEP discusses.)

**How Mastodon renders it.**

- Spec page (<https://docs.joinmastodon.org/spec/activitypub/>, accessed 2026-08-18):
  "Mastodon implements support for handling remote quote posts according to FEP-044f.
  Additionally, it understands `quoteUri`, `quoteUrl` and `_misskey_quote` for
  compatibility." Also: "Should a post contain multiple quotes, Mastodon only accepts the
  first one."
- **4.4** (<https://blog.joinmastodon.org/2025/07/mastodon-4-4-for-devs/>, published
  2025-07-01): "support for verifying and displaying remote quote posts" per FEP-044f, shown
  in the web UI; "Being quoted and quoting other people is not implemented yet (this is
  coming in Mastodon 4.5)." REST: a new `quote` attribute on `Status`/`StatusEdit`. A
  `quote-inline` CSS class marks backward-compatible duplicate markup that quote-aware
  clients can hide.
- **4.5** (<https://blog.joinmastodon.org/2025/10/mastodon-4-5-for-devs/>, published
  2025-10-29): authoring quotes via `quoted_status_id` on status creation, plus quote states
  `blocked_account`, `blocked_domain`, `muted_account`. So: **4.4 reads quotes, 4.5 writes
  them and grants approvals.**
- User-facing (<https://docs.joinmastodon.org/user/quote-posts/>, accessed 2026-08-18):
  "For every post you make, you can decide who can quote you, from 'Anyone', 'Followers
  only', and 'Just me'."; "You can revoke a quote at any time. This will be irreversible
  though, so proceed with caution."; "Quote posts create a new context, and do not appear in
  the replies."; quotes that fail verification "will appear as regular posts, not as
  quotes."

**Friction with the Patches model (§180.2).**

- `posts.quote_policy` (`ANYONE` / `FOLLOWERS` / `NOBODY`) lines up with Mastodon's
  Anyone / Followers only / Just me almost exactly — the spec page notes Mastodon converts
  interaction policies to "public", "followers", "following" and "nobody" combinations, so
  the only unmapped value is `following`, which Patches does not offer. `inferred:` no local
  model change is needed for this to map later; do **not** add a `FOLLOWING` value now just
  because Mastodon has one.
- §193 already requires that "a quote of a remote post MUST NOT be displayed as authorized
  unless authorization was actually received". Concretely, under FEP-044f that means holding
  a `quoteAuthorization` stamp — an unauthorized quote is still rendered, just not as an
  endorsed/approved one, which is what Mastodon does too.
- **Revocation is real and irreversible on Mastodon.** `inferred:` a local `quote_policy`
  change or revocation must be able to invalidate a previously issued authorization, so any
  future schema should treat authorization as a row with a lifecycle, not a boolean on the
  quoting post.
- `inferred:` emitting the three legacy properties alongside `quote` is cheap and is what the
  FEP itself recommends; it is a serializer detail, not a data-model decision, so it does not
  need deciding now.

---

## 3. Tags — `Hashtag`

- **`Hashtag` is not in the ActivityStreams 2.0 Vocabulary.** Verified by inspection of
  <https://www.w3.org/TR/activitystreams-vocabulary/> (accessed 2026-08-18): no `Hashtag`
  type is defined anywhere in that document. Only `tag` (the property) is: "One or more
  'tags' that have been associated with an objects. A tag can be any kind of Object. The key
  difference between `attachment` and `tag` is that the former implies association by
  inclusion, while the latter implies associated by reference." Domain `Object`, range
  `Object | Link`.
- It is a registered **extension** term: <https://www.w3.org/wiki/Activity_Streams_extensions>
  (accessed 2026-08-18) lists "ActivityPub Miscellaneous Terms" — "A group of widely-used
  miscellaneous terms added to the Activity Streams 2.0 namespace using the default
  vocabulary, including `Hashtag`, `manuallyApprovesFollowers`, `movedTo`, and `sensitive`."
  So `as:Hashtag` resolves in the AS2 namespace, but its meaning is convention, not
  Recommendation text. This is the same situation as `movedTo`/`alsoKnownAs` in
  `docs/architecture/federation.md` §0.1 — name our columns in our own terms, map at the
  boundary, and never call it standard AS2 in code or comments.

**How Mastodon renders it.** Source: <https://docs.joinmastodon.org/spec/activitypub/>
(accessed 2026-08-18): "Mastodon will use `Hashtag` as a subtype of Link in order to surface
posts referencing some common topic identified by a string key."

```json
{ "type": "Hashtag", "name": "#cats", "href": "https://example.com/tagged/cats" }
```

The same page: "Mastodon will also normalize hashtags to be case-insensitive lowercase
strings, performing ASCII folding and removing invalid characters." It also notes "Mastodon
requires `Mention` tags in order to generate a notification" — relevant to §5 below, since
`Mention` and `Hashtag` share the one `tag` array.

**Friction with the Patches model (§181).**

- Patches normalizes `tags.name` with **NFKC + case folding**; Mastodon does **ASCII
  folding** + lowercasing. These are different functions: `inferred:` accented or
  full-width spellings that are one tag on Mastodon may be two on Patches and vice versa, so
  a federated tag timeline will not be a superset or a subset of a remote one — it will be a
  different set. Do not promise "the same tag" across nodes; that promise cannot be kept.
- §181 already says remote tags "are ingested but not trusted for local timeline inclusion
  until federation reaches §193's stage". Keep that: a remote `Hashtag` `name` is attacker-
  controlled input subject to §192's control-character/bidi rules like any other string.
- The `href` on a remote `Hashtag` points at the remote node's tag page. `inferred:` we never
  follow it; our tag timeline is built from our own relation table, and a remote `href` is
  display metadata at most.
- §181's prohibitions (no `post_count` column, no trending, no popularity ordering) are
  unaffected by anything here — federation adds no reason to count tags.

---

## 4. Communities — `Group` actors (partly unverified)

This is the section §193 flags as unverified. What follows separates what is now **verified**
from what genuinely remains open.

### 4.1 Verified: FEP-1b12 is the pattern, and it is FINAL

Source: <https://codeberg.org/fediverse/fep/src/branch/main/fep/1b12/fep-1b12.md> (accessed
2026-08-18). "Group federation", **status FINAL**, finalized 2023-02-09 — note this is a
stronger footing than FEP-044f's DRAFT.

- Core rule: a group receives an activity from a user, validates it, and then "the group MUST
  wrap it in an `Announce` activity, with the original activity as object", distributing that
  to the group's followers. So a `Group` is a **relay with membership**, not a container.
- Addressing: the FEP standardizes the `audience` property to identify the group, explicitly
  to avoid resolution loops, while recording that "Lemmy, Friendica and lotide put the group
  ID in the `to` field. Peertube uses `attributedTo`." At publication it noted `audience` "is
  not in use yet" and told platforms to "continue to federate the group identifier in the
  existing format for backwards compatibility".
- Named implementations: Lemmy, Friendica, Hubzilla, Lotide, Peertube.
- Groups "MAY choose not to forward some activity types which are considered private";
  moderation features are optional and implementation-specific.

### 4.2 Verified: what Lemmy and Mbin actually do

- **Lemmy** (<https://join-lemmy.org/docs/contributors/05-federation.html>, accessed
  2026-08-18): "Community: `Group`". "When a user creates a new post, it is sent to the
  respective community as `Create/Page`." And: "If the Community receives any Post or Comment
  related activity (Create, Update, Like, Dislike, Remove, Delete, Undo etc.), it will forward
  this to its followers. For this, an `Announce` is created with the Community as actor, and
  the received activity as object." The page warns its examples "include many optional fields
  which you can safely ignore" and directs implementers with problems to open an issue —
  i.e. it is a guide, not a specification.
- **Mbin** (<https://docs.joinmbin.org/fediverse_developers/>, accessed 2026-08-18): each
  magazine has an actor at `https://instance.tld/m/name` of type `Group`; Mbin follows FEP
  Group federation (FEP-1b12); "The magazine is mainly there to announce the activities users
  do with it as the audience", with `audience` set to the magazine URI. Announced activity
  types include Create, Update, Add, Remove, Announce, Delete, Like, Dislike, Flag, Lock, with
  `Announce(Flag)` "only sent to instances with moderators of this magazine on them".

### 4.3 Still unverified — the questions that must be answered before any code

- `unverified:` **How a microblog server renders a `Group` actor and its `Announce`s.**
  Mastodon's ActivityPub page documents only that an actor is "Assumed to be `Person`. If
  type is `Application` or `Service`, it will be interpreted as a bot flag" — `Group` and
  `Organization` are not mentioned at all. We could not find a primary Mastodon source
  describing `Group`-actor handling, so we do not know whether following a Patches community
  from Mastodon yields a usable timeline, a stream of boosts, or nothing.
- `unverified:` whether Lemmy/Mbin accept a `Create` from a non-Lemmy node into a community
  they host without out-of-band arrangements, and what validation they apply.
- `unverified:` the interaction between FEP-1b12 group `Announce`s and §180.1's "reposts must
  not reorder" rule — a group `Announce` looks exactly like a repost on the wire but means
  "this belongs to this community", which is a different thing. Distinguishing the two on
  **inbound** is an open design problem, not a decided one.
- `unverified:` whether `audience` is now in general use (the FEP said it was not in 2023, and
  Mbin uses it today, but Lemmy's documented shape still uses `to`).

**Friction with the Patches model (§182).** Communities are explicitly **local to a node in
v0** (§182.1), so none of this is urgent. Two local model facts do have federation
consequences worth recording now: `community_id` is immutable and a post belongs to **at most
one** community (§182.2) — which fits FEP-1b12's single-`audience` shape cleanly — and node
moderators outrank community moderators, with community moderation scoped to the community
(§182.3), which is a stricter model than FEP-1b12's optional/implementation-defined
moderation. `inferred:` a federated community would import remote moderation decisions, which
is exactly why §195.2 reserves federated communities for owner sign-off. Per §193, federated
communities need **their own ADR** and a re-verification of everything in §4.3 before any
implementation.

---

## 5. Direct messages — private `Note` addressing

DMs are **not federated in v0** (§183.4, §194), and federated DMs are a separate owner
sign-off with their own gate (§195.6). This section records the shape only.

### 5.1 What ActivityPub says

Source: <https://www.w3.org/TR/activitypub/> (accessed 2026-08-18).

- §5.6 Public Addressing: the special public collection is
  `https://www.w3.org/ns/activitystreams#Public`; compacting with the AS2 context "might
  result in `https://www.w3.org/ns/activitystreams#Public` being represented as simply
  `Public` or `as:Public` which are valid representations". Implementations "**MUST NOT**
  deliver to the 'public' special collection; it is not capable of receiving actual
  activities."
- Addressing properties are `to`, `bto`, `cc`, `bcc`, `audience` (§6.1 client addressing,
  §7.1 delivery — delivery targets are computed from all five).
- Blind addressing: "The server **MUST** remove the `bto` and/or `bcc` properties, if they
  exist, from the ActivityStreams object before delivery, but **MUST** utilize the addressing
  originally stored on the `bto` / `bcc` properties for determining recipients." `inferred:`
  this is the single most dangerous rule in a DM implementation — forget the removal step and
  every recipient learns the whole recipient list. It is also why a group DM (§183.3, ≤ 8
  members) is not a trivial extension of a 1:1 DM.

A private `Note` is therefore: `to` = the recipient actor URIs **only**; no `as:Public`
anywhere in `to` or `cc`; no follower-collection URI anywhere in `to` or `cc`; ideally no
`cc` at all.

### 5.2 How Mastodon renders it

Source: <https://docs.joinmastodon.org/spec/activitypub/> (accessed 2026-08-18). Mastodon
derives visibility from addressing:

| Mastodon visibility | Addressing rule (quoted)                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| public              | "Public statuses have the `as:Public` magic collection in `to`"                                                                    |
| unlisted            | "Unlisted statuses have the `as:Public` magic collection in `cc`"                                                                  |
| private             | "Followers-only statuses have an actor's follower collection in `to` or `cc`, but do not include the `as:Public` magic collection" |
| limited             | "Limited-audience statuses have actors in `to` or `cc`, at least one of which is not `Mention`ed in `tag`"                         |
| direct              | "Mentions-only statuses have actors in `to` or `cc`, all of which are `Mention`ed in `tag`"                                        |

`inferred:` the `limited`/`direct` distinction is the trap. To be classified `direct` by
Mastodon — rather than `limited` — **every** addressed actor must also carry a `Mention` tag
on the object. And since "Mastodon requires `Mention` tags in order to generate a
notification" (same page), omitting them means the recipient may never be told the message
exists. A federated Patches DM would have to emit both `to` and matching `Mention` tags.

**Mastodon's own honest posture is the same as ours.**
<https://docs.joinmastodon.org/user/posting/> (accessed 2026-08-18): "**Do not share dangerous
and sensitive information over private mentions**. Mastodon is not an encrypted messaging app
like Signal or Matrix, and the database administrators of the sender's and recipient's servers
may obtain access to the text." Also: "Only accounts that were mentioned in your post can see
it" and it "will not appear in the home timeline."

### 5.3 Friction with the Patches model (§183)

- Patches DMs are **conversations** (`conversation_id`, ≤ 8 members, membership changes,
  archive on < 2 active members — §183.3). ActivityPub direct addressing has **no
  conversation object**: each `Note` carries its own recipient list, and there is no protocol
  guarantee that two notes belong to the same thread. `inferred:` federating conversations
  would require either a Patches extension property or reconstructing conversations from
  recipient sets, and the second is unreliable. This is a genuine model mismatch, not a
  serialization detail — record it and leave it to §195.6.
- Message requests (§183.2), decline-bars-30-days, and "mutuals only" have no protocol
  equivalent at all. `inferred:` a remote sender cannot be held to them by the wire format;
  they would have to be enforced entirely on inbound at our node.
- §183.4's report-snapshot evidence model presumes the node can read message bodies — see
  `docs/decisions/0017-server-visible-dms.md`. Federating DMs multiplies the number of node
  operators who can read a given message from one to two-or-more, which is precisely the
  exposure §183.4 declines to take on in v0.
- §183.1's labelling obligation ("Not end-to-end encrypted — this node's operators can read
  these messages") would need re-wording if DMs ever federate, because "this node's
  operators" would no longer be the full set of readers.

---

## 6. Summary — what must be true before any of this is implemented

| Area        | Wire shape                                                      | Footing              | Blocking question                                                   |
| ----------- | --------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| Reposts     | `Announce` / `Undo(Announce)`                                   | W3C Recommendation   | Stable, reconstructible `Announce` id for `Undo`                    |
| Quotes      | `quote` + `quoteAuthorization` (FEP-044f) + 3 legacy properties | FEP **DRAFT**        | Authorization lifecycle (issue, verify, revoke)                     |
| Tags        | `Hashtag` in `tag` (AS2 extension term, not the Recommendation) | Convention           | Normalization mismatch (NFKC+casefold vs ASCII-fold+lowercase)      |
| Communities | `Group` actor `Announce`-wrapping member activities (FEP-1b12)  | FEP FINAL, thin docs | How microblog servers render `Group`s; inbound `Announce` ambiguity |
| DMs         | `Note` with `to` = recipients only, matching `Mention` tags     | W3C Recommendation   | No conversation object; `bto`/`bcc` stripping; §195.6 sign-off      |

Per §193 and §155, **re-verify every row above against current upstream documentation at the
time of implementation.** FEP-044f is a draft and Mastodon's quote support changed across two
minor releases inside four months — treat anything here older than the implementation date as
a lead, not a fact.
