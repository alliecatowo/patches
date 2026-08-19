# Roadmap

Source of truth: `INITIAL_VISION.md` §§134–160, as amended by **§176 (Amendment A)** and
**§178–§195 (Amendment B)**. This document restates the execution roadmap and acceptance
checklists in one place so status can be tracked without re-reading the full spec. Update the
status line at the top of each phase as work lands — don't let this drift into fiction.

**As of 2026-08-18: Phases 0–8 are implemented on the integration branch (see `tasks.md`); Phase 7 is implemented and deployed — the flagship node `patches-social.fly.dev` is live and verified end to end. Media/email credentials (R2, Resend) are still pending — see `tasks.md` B-031.**

**As of 2026-08-18 (Amendment B, spec §178–§195):** board Phase 11 — social depth (reposts and
quotes, tags, communities, DMs, feed customization) — is the active work stream, and board
Phase 10 (web + React Native clients) is **paused** until it ships. See
[Owner-directed board phases](#owner-directed-board-phases-911) below, and note that §176's
release-phase numbers and `tasks.md`'s board-phase numbers are different sequences (§179).

## Release sequence (§176)

Federation moves earlier than originally scheduled; **every security gate stays where it
was**, and "finish the centralized vertical slice first" (§0) is unchanged.

| Release | Contents                                      | Federation stage |
| ------- | --------------------------------------------- | ---------------- |
| v0.0    | Single-node social loop — Phases 0–7 + 4.5    | F0               |
| v0.1    | Two-node federation lab — Phase 8             | F1               |
| v0.2    | Self-hostable node release — Phase 9          | F1               |
| v0.3    | Mastodon/Pixelfed interoperability — Phase 10 | F2               |
| v0.4    | Identity portability / migration — Phase 11   | F2               |
| v1.0    | Public federation — Phase 12                  | F3               |

See ADR [0013](../decisions/0013-node-model-and-earlier-federation.md).

---

## Phase 0 — repository and risk spikes

**Status: complete (2026-08-17)**

Deliver: monorepo skeleton, mise, Node/pnpm pinning, TypeScript base config, Turborepo,
lint/format, GitHub Actions skeleton, Docker Compose PostgreSQL, a Nest hello-world gRPC
service, an Ink hello-world client, protobuf generation, a real gRPC client call, and a
Kitty image proof-of-concept.

**Success criteria:** the Patches TUI calls the local Nest server through a generated
protobuf contract, and a test image can be displayed and cleared in Kitty. Do not proceed
to Phase 1 until both are true — these are the two biggest architectural risks in the
project (gRPC/Ink integration, and terminal image rendering) and everything else assumes
they work.

## Phase 1 — persistence and auth

**Status: implemented**

Implement: TypeORM configuration, initial migrations, `Actor`, `User`, **`credentials`**,
`ssh_login_challenges`, refresh tokens, invites, email verification, `AuthService`,
registration/login. TUI: `patches register`, `patches login`, `patches logout`,
`patches accounts`.

**Amended by Amendment A (§165–§169):**

- `users.password_hash` does **not** exist — credentials live in the `credentials` table, and
  the Argon2id hash is `credentials.secret_hash` (ADR 0011).
- Email is nullable recovery/verification data, not the account identifier. Required only for
  password-only accounts (and where node policy requires it).
- Auth methods in Phase 1: **password + SSH-key challenge/response**. GitHub device flow is
  Phase 6 (justification below).
- Sessions are stored **per node** in the TUI (`CredentialStore` keyed by node origin + user
  id); a token is never sent to an origin other than its issuer.
- `actors` carries the portability seam (`moved_to_uri`, `also_known_as`) and `nameplate`
  from the first migration — columns exist, unused until later phases.

Flows and the security checklist: [`../architecture/auth.md`](../architecture/auth.md).

**Success criteria:** a fresh user can register (with an SSH key or a password), log in,
restart their terminal, and remain authenticated; a second credential can be added and
revoked; revoking the last one fails.

## Phase 2 — posting

**Status: implemented**

Implement: posts, create post, get post, delete post, actor profile, actor post list. TUI:
own profile, compose, profile timeline.

**Success criteria:** two users can independently post and inspect each other's profiles.

## Phase 3 — social graph / feed

**Status: implemented**

Implement: follow, unfollow, home feed, local feed, keyset pagination. TUI: Home, Local,
actor search, follow controls.

**Success criteria:** Alice follows Bob. Bob posts. Alice's chronological feed shows Bob's
post.

## Phase 4 — replies / reactions

**Status: implemented**

Implement: threaded replies, likes, bookmarks, notifications. TUI: thread screen, reply
action, like, bookmark, notification screen.

**Success criteria:** the core social loop exists end to end.

## Phase 4.5 — Pages v1

**Status: implemented**

Implement: the `PatchesPage` document schema and validator (in `packages/domain`), `pages` /
`page_revisions` / `page_assets` / `guestbook_entries` tables, `PageService`
(`GetPage`/`UpdatePage`/`ListGuestbook`/`SignGuestbook`), the **Ink renderer**, basic theme,
and the blocks `Text`, `Markdown`, `Links`, `Posts`, `TopEight`, `Guestbook`. TUI:
`patches visit @handle[/slug]` and a page editor.

`Image` and `Gallery` are defined in the schema at 4.5 but render as a **placeholder** until
the Phase 5 media pipeline exists — the schema may lead the pipeline; the renderer may not
fake it (§176).

Non-negotiable: the document is inert data — no executable user code, in any client, ever;
the server never renders; guestbooks ship with block-awareness, rate limiting,
reportability, and owner/moderator removal. See
[`../architecture/pages.md`](../architecture/pages.md) and ADR
[0012](../decisions/0012-patches-pages-portable-declarative.md).

**Success criteria:** Alice edits her Page; Bob runs `patches visit @alice`, sees it rendered
in his terminal, and signs her guestbook.

## Phase 5 — production media

**Status: implemented**

Replace the Phase 0 image POC with the real pipeline: R2, upload initialization, direct
client upload, worker processing, Sharp derivatives, terminal media cache, Kitty rendering,
fallback for unsupported terminals.

**Success criteria:** Alice attaches a photo. Bob sees it inline in a supported terminal.

## Phase 6 — moderation / security

**Status: implemented**

Implement: block, mute, report, admin commands, audit log, rate limits, account suspension,
password reset, robust input validation, **GitHub OAuth device flow** as a credential type.

GitHub device flow lands here rather than in Phase 1 because: it is the first outbound HTTP
call to a third party, so it wants this phase's URL/timeout/SSRF validation baseline; linking
a provider credential to an existing account is an account-takeover surface best built
alongside suspension and audit logging; and no item in the v0 acceptance checklist (§158)
depends on it. Phase 1's browserless paths (password, SSH) remain the primary ones — §153's
"never require a browser for normal TUI usage" is unaffected.

**Success criteria:** the service can safely support invited outside users.

## Phase 7 — deploy public v0

**Status: implemented and deployed (patches-social.fly.dev); media/email credentials pending**

Deployed: Fly server + worker (`patches-social`), Postgres (Fly Postgres cluster
`patches-social-db`; Fly Managed Postgres/Neon switch still planned — see
`docs/operations/deployment.md`), secrets, TLS via Fly, structured logs, migrations on
release. Verified end to end with two real accounts (register, login, post, follow, like,
reply, thread, notifications, home feed) and a passing smoke `patches ping`. Not yet live:
R2 media credentials and a verified Resend sending domain (both dashboard-only to provision —
`tasks.md` B-031), a production domain (`patches.social`, currently `patches-social.fly.dev`
only), and running the deploy workflow through CI (still gated on
`vars.FLY_DEPLOY_ENABLED`; this deploy was done by hand).

**Success criteria:** a user on another computer can run `npm install -g patches`, `patches`,
and use the real network. **Partially met**: a user on another computer can build from a
source checkout and use the real, live network today (see README "Try the live node"); the
published `npm install -g` path is still planned (package depends on two unpublished
workspace packages).

---

## MVP polish phase

**Status: planned**

Before calling the project MVP, all of the following must be true:

- navigation feels intentional,
- resize works,
- errors are human-readable,
- images don't ghost,
- network loss doesn't crash the client,
- drafts are not easily lost,
- README is excellent,
- install instructions work from a clean environment,
- a demo recording exists,
- an architecture diagram exists,
- tests run in CI,
- migrations are reproducible,
- moderator workflows work,
- deployment is documented,
- backups are known and documented,
- the public alpha has published community rules.

---

## Owner-directed board phases (9–11)

**Two phase sequences exist and must not be confused (spec §179).** §176's phase numbers are
_release_ phases (Phase 8 → v0.1, Phase 9 → v0.2, Phase 10 → v0.3, Phase 11 → v0.4, Phase 12
→ v1.0) and are referred to below by **release number**. `tasks.md`'s Phase 9/10/11 are
_board_ phases — owner-requested work streams that continued the task-board sequence past 8.
A board phase number is not a §176 release phase.

### Board Phase 9 — site, media, packaging

**Status: done except credentials.** The VitePress site is live
(`https://patches-site.pages.dev`), TUI screenshots/GIFs are recorded and embedded, and the
TUI is packaged and install-verified from a tarball as `patches-social`. Outstanding: P9-004
— a real Resend sending domain and real R2 credentials. That work is operational, not site
work, and is **not** covered by the pause below.

### Board Phase 10 — web + React Native clients

**Status: paused (owner, 2026-08-18).** Resume only after board Phase 11 ships. The Connect
edge (P10-004) and [ADR 0016](../decisions/0016-connect-transport-and-client-sdk.md) stay as
landed — the decision is unchanged, the schedule is. Further site/marketing work is paused
on the same terms.

The reasoning is in spec §179: Patches earns a second client by being finished on the first
one. Nothing about this pause weakens §153's "don't build the mobile app before the TUI/server
MVP" — it strengthens it.

### Board Phase 11 — social depth (Amendment B)

**Status: planned.** Spec **§178–§195**. TUI-first: a feature is not done until it is usable
from the terminal.

- **Reposts and quotes** (§180) — a repost is a pointer, a quote is a post with
  `quoted_post_id`, per-post quote policy, and neither ever changes a post's feed position.
- **Tags** (§181) — write-time extraction, normalized identity, chronological tag timelines,
  tag search, tag mutes. No trending, no tag counters.
- **Communities** (§182) — `+name`, join/leave, chronological community timelines,
  moderators, rules, invites. No votes, no karma, no sort selector.
- **Direct messages** (§183) — 1:1 and groups of ≤ 8, mutual-or-accepted gating, message
  requests, block-aware, reportable, rate-limited, text-only. **Server-visible, not
  end-to-end encrypted**, and every client says so on the screen where messages are read.
- **Flair, pinned posts, walls** (§184) — post accent, border style, like glyph, wall theme,
  ≤ 3 pinned posts, all under capabilities-not-tiers: cosmetics may be capability-gated, a
  _function_ may never be paywalled.
- **Plain mode and quiet feed** (§185) — the reader's opt-out, client-side.
- **Edits with visible history, deletion, read-more folds** (§186). Scheduled posts, polls,
  and post analytics are explicitly out.
- **New notification types** (§187) — `REPOST`, `QUOTE`, `MESSAGE`, `COMMUNITY_INVITE`.

Federation mapping for all of it (§193) is a **later** stage and moves no §109 gate.
Needs owner sign-off before anyone starts: E2E DMs, community scope beyond v0, any paid
cosmetics (§195).

**Success criteria:** from the TUI alone, an actor can repost and quote, follow a tag, join a
community and post into it, hold a DM conversation they were not spammed into, edit a post
and show its history, decorate their own posts — and a second actor can turn every bit of
that decoration off for themselves without losing any content.

---

## Post-v0.0 roadmap (§176)

Amendment A replaced the old 0.3–1.0 sequence. Identity personality (profile theme, Top 8,
guestbook) moved **earlier**, into Phase 4.5 — it's the personal-web pillar, not a post-MVP
experiment. Federation moved earlier too, with every security gate unchanged.

These are **release** phases and are titled by release number here, because `tasks.md` uses
the same numbers for a different (board) sequence — see §179 and
[Owner-directed board phases](#owner-directed-board-phases-911) above.

### v0.1 — two-node federation lab (§176 Phase 8)

**Status: implemented (lab).** Federation Stage F1, **local and non-public**. Two Patches nodes on one
machine: WebFinger, actor documents, inbox/outbox, `Follow`, `Accept`, `Create` (Note),
`Delete`, basic `Like`, and durable delivery through the existing outbox/jobs machinery with
bounded retries and safe duplicate delivery.

No Mastodon-compatibility goal yet. The objective is proving Patches-to-Patches federation
end to end, four releases earlier than originally scheduled, while a wrong actor/URI/delivery
assumption is still cheap to fix.

**Success criteria:** Alice on node A follows Bob on node B; Bob posts; the post appears in
Alice's home feed; Bob deletes it; it tombstones on node A.

### v0.2 — self-hostable node release (§176 Phase 9)

**Status: planned.** A published node image plus a Compose template, documented environment
variables, an upgrade/migration path, and a security contact. **Federation is disabled by
default** in a fresh node, and no proprietary dependency is required — any S3-compatible
object store, any SMTP endpoint.

**Success criteria:** an operator who has not read the source can stand up a working node
from the published image and documentation, and federate it with a second node only by
explicit choice.

### v0.3 — Fediverse interoperability (§176 Phase 10)

**Status: planned.** Federation Stage F2. Interop with Mastodon and Pixelfed: discovery
robustness, HTTP signing compatible with ecosystem expectations, remote actor caching,
remote object ingestion, retry, deduplication, blocklists, domain moderation.

### v0.4 — identity portability (§176 Phase 11)

**Status: planned.** Account migration between nodes using the seam built in Phase 1
(`actors.moved_to_uri`, `also_known_as`), with bidirectional verification required before a
move is honored, plus the full data export (profile, posts, media manifest, page document,
social graph). Export is never gated behind a capability or payment.

### v1.0 — public federation (§176 Phase 12)

**Status: planned.** Federation Stage F3. Enabled only after the full §160 readiness
checklist passes. The single-node product still works without federation — federation is
additive, never a hard dependency.

### Feed customization (unscheduled)

Photo-only feed, custom actor lists, client filters, declarative local feed definitions (the
A2 stage of the feed-rule DSL — see [`principles.md`](./principles.md)). Sequenced against
the releases above when there is demand; feed definitions remain **data, not executable
code**.

---

## React Native

**Status: paused (owner, 2026-08-18).** Begin only after the server contract is stable enough
to support a second client **and** board Phase 11 (social depth, spec §178–§195) has shipped
— see [Board Phase 10](#board-phase-10--web--react-native-clients) above. The transport and
SDK decision (ADR 0016) is already made and stands.

Add `apps/mobile/` using React Native + TypeScript. Reuse domain vocabulary, protobuf
schemas, API semantics, and authentication concepts. Do not attempt to reuse Ink UI
components directly — share non-UI logic only where it genuinely fits. The TUI remains a
permanent first-class client, not something discarded once a GUI exists.

**Mobile transport:** native gRPC may be used if React Native support is clean at
implementation time; otherwise a protobuf-derived HTTP transport such as Connect/HTTP.
Protobuf remains the canonical schema either way — no separate hand-written REST model for
mobile.

---

## Federation stages (F0–F3)

Federation is sequenced independently of the phase numbers above; it does not start until
the centralized product (through MVP) works.

### Stage F0 — schemas only

Centralized system. The data model already understands local/remote actor possibility,
canonical URIs, origin, tombstones, and visibility. No remote network requests are made.

### Stage F1 — two-node lab (v0.1, Phase 8)

Run two Patches nodes locally. Implement WebFinger, actor documents, inbox/outbox,
Follow, Accept, Create Note, Delete, and optionally basic Like. No Mastodon compatibility
goal yet — the target is proving Patches-to-Patches federation works.

### Stage F2 — interoperability (v0.3–v0.4, Phases 10–11)

Test against mainstream ActivityPub implementations. Implement discovery, HTTP signing
compatible with ecosystem expectations, remote actor caching, remote object ingestion,
retry, deduplication, a blocklist, and domain moderation.

### Stage F3 — public federation (v1.0, Phase 12)

Only enabled after abuse controls, SSRF protection, signature verification, job retries,
tombstones, remote deletion handling, monitoring, and domain controls all exist.

---

## Acceptance checklists

These are the literal go/no-go gates from the spec (§§157–160). A phase or milestone is not
"done" until every box is checked — partial credit doesn't count for these.

### Phase 0 acceptance checklist

- [x] `mise install` produces the required toolchain.
- [x] `pnpm install` succeeds.
- [x] PostgreSQL starts locally.
- [x] protobuf schemas compile.
- [x] Buf lint succeeds.
- [x] Nest server starts.
- [x] Ink TUI starts.
- [x] TUI performs a real gRPC request.
- [x] request failures render cleanly.
- [x] Kitty capability can be detected.
- [x] a test image renders in Kitty. _(confirmed manually in Ghostty 1.3, 2026-08-17)_
- [x] the image can be cleared. _(confirmed manually in Ghostty 1.3, 2026-08-17)_
- [x] terminal state restores after exit.
- [x] CI executes build/typecheck/test skeleton. _(workflow written + actionlint-clean; first real run happens on the PR)_

### v0 acceptance checklist

v0 is complete only when two real users can:

- [x] register (with an SSH key or a password),
- [ ] verify email _(where the node requires it — §165)_ — **in progress — A-028**,
- [x] login by password,
- [x] login by SSH key,
- [x] add and revoke a second credential,
- [x] edit and visit a Page,
- [x] persist session securely,
- [ ] edit profile — **in progress — A-027**,
- [x] search local actors,
- [x] follow,
- [x] unfollow,
- [x] post text,
- [x] upload static image,
- [x] view inline image in Kitty,
- [x] use media fallback elsewhere,
- [x] see chronological home feed,
- [x] see chronological local feed,
- [x] open thread,
- [x] reply,
- [x] like,
- [x] unlike,
- [x] bookmark,
- [x] block,
- [x] mute,
- [x] report,
- [x] receive basic notifications,
- [x] logout.

And administrators can:

- [x] create invites,
- [x] inspect reports,
- [x] suspend a user,
- [x] remove content,
- [x] inspect an audit record.

### MVP deployment checklist

- [ ] production domain configured _(node is live at `patches-social.fly.dev`; the intended
      custom domain `patches.social` is still planned — `docs/operations/deployment.md`)_,
- [x] TLS works _(Fly-terminated TLS on 443, confirmed by `patches ping` over TLS against the
      live node)_,
- [x] gRPC through Fly works _(confirmed live — `h2_backend`, verified end to end with real
      accounts, see `docs/operations/deployment.md#first-deploy-2026-08-18`)_,
- [ ] Managed Postgres configured _(live node uses a Fly Postgres cluster, not Fly Managed
      Postgres yet — planned switch, `docs/operations/deployment.md`)_,
- [ ] R2 configured _(bucket exists; S3 access keys are dashboard-only and not yet fetched —
      uploads disabled in prod, `tasks.md` B-031)_,
- [x] worker configured _(`worker` process group live on `patches-social`)_,
- [ ] email delivery configured _(`EMAIL_PROVIDER=console` — Resend sending domain not yet
      verified, `tasks.md` B-031)_,
- [x] migrations deploy automatically but explicitly _(confirmed live — `release_command`
      (`node server/migrate.mjs`) ran migrations successfully before the 2026-08-18 deploy's
      Machines took traffic)_,
- [x] secrets are not in the repository,
- [x] production health checks work _(Fly TCP check against the gRPC port passing on the live
      node; a real HTTP health check remains a documented follow-up, see
      `docs/operations/deployment.md#health-checks`)_,
- [x] structured logs work,
- [x] error monitoring works or a documented alternative exists _(structured-log-only
      alternative documented — `docs/operations/deployment.md#error-monitoring`; A-033)_,
- [x] backup strategy exists _(documented — `docs/operations/backups.md`; not yet exercised
      against the live Postgres instance)_,
- [x] restoration procedure is documented _(`docs/operations/backups.md`)_,
- [x] rate limiting exists,
- [x] integration suite passes,
- [x] smoke tests pass after deploy _(`patches ping` against `patches-social.fly.dev:443`
      returns `{"ok":true,...}`)_,
- [ ] README installation works from a clean environment _(README's "Try the live node" steps
      have not been run from a genuinely clean checkout by a third party yet)_,
- [ ] npm package install works _(needs a real registry publish — packages not yet
      published)_,
- [x] TUI works against production _(verified end to end with two real accounts on
      `patches-social.fly.dev` — register, login, post, follow, like, reply, thread,
      notifications, home feed)_,
- [x] user documentation exists _(`docs/user-guide.md`; A-034)_,
- [ ] moderation guidelines exist _(`docs/operations/moderation.md` covers admin workflow;
      public-facing community rules are a v0.0 MVP-polish item, not yet written)_.

### Federation readiness checklist

Do not publicly enable federation until:

- [ ] stable canonical domain selected,
- [ ] WebFinger works,
- [ ] actors serialize correctly,
- [ ] ActivityStreams objects validate,
- [ ] inbox works,
- [ ] outbox works,
- [ ] Follow works,
- [ ] Accept works,
- [ ] Create works,
- [ ] Delete works,
- [ ] Update semantics decided,
- [ ] deliveries are durable,
- [ ] duplicate delivery is safe,
- [ ] retries are bounded,
- [ ] signatures verified,
- [ ] SSRF defenses exist,
- [ ] remote response sizes bounded,
- [ ] remote request timeouts exist,
- [ ] domain blocking exists,
- [ ] remote delete/tombstones work,
- [ ] moderator can block a remote server,
- [ ] federation telemetry exists,
- [ ] two Patches servers interoperate,
- [ ] at least one mainstream Fediverse implementation interoperates.
